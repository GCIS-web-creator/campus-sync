import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { CLASS_TIMETABLE_DATA, getTokyoTomorrowTimetableInfo, mapClassTimetableRows, type ClassTimetableData, type ClassTimetableRow } from '@/lib/class-timetable';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';
import { buildTimetableDirectionBox, type TimetableDeparture } from '@/lib/line-flex';
import { fetchSchoolWeatherForecast, type WeatherDayForecast } from '@/lib/weather';
import { buildWeatherForecastBubble } from '@/lib/line-weather-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TrainRow = { direction: string; departure_time: string; service?: string | null };
type EventRow = { title: string; summary?: string | null; event_date: string };
type AssignmentDigestRow = { id: string; title: string; details: string | null; subject: string | null; subject_option: string | null; target_class: string | null; due_at: string | null; priority?: 'normal' | 'important' | 'urgent' | null };
type ScheduleChangeDigestRow = { id: string; entity_type: string; entity_id: string; action: string; title: string; subject: string | null; priority: string; summary: string; previous_value: Record<string, unknown> | null; next_value: Record<string, unknown> | null; reason: string | null; created_at: string };
type SchoolExamRangeSection = { title: string; body: string; note?: string | null };
type SchoolExamRangeDigestRow = { subject: string; display_subject: string; audience: string; range_sections: SchoolExamRangeSection[]; sort_order: number };

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokyoParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function dateKeyFromParts(parts: Record<string, string>): string {
  return String(parts.year) + '-' + String(parts.month) + '-' + String(parts.day);
}

function stableRetryKey(dateKey: string, deliveryType = 'weekday'): string {
  const chars = createHash('sha256')
    .update('campussync-daily-line-digest:' + deliveryType + ':' + dateKey)
    .digest('hex')
    .slice(0, 32)
    .split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

function minutesFromTimetableTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateKey(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return month + '/' + day;
}

function daysUntil(today: string, eventDate: string): number {
  const a = today.split('-').map(Number);
  const b = eventDate.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

type ClassTimetableDayKey = keyof (typeof CLASS_TIMETABLE_DATA)['7組'];

function buildBoardBubble(input: {
  eyebrow: string;
  title: string;
  subtitle: string;
  bodyContents: Record<string, unknown>[];
}) {
  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F172A',
      paddingAll: '18px',
      spacing: 'sm',
      contents: [
        { type: 'text', text: input.eyebrow, size: 'xs', color: '#67E8F9', weight: 'bold' },
        { type: 'text', text: input.title, size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: input.subtitle, size: 'xs', color: '#CBD5E1', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      spacing: 'md',
      contents: input.bodyContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      backgroundColor: '#F8FAFC',
      spacing: 'xs',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
      ],
    },
  };
}

function buildTransitBubble(input: {
  dateLabel: string;
  directionTitle: string;
  accent: string;
  departures: TimetableDeparture[];
  trainError: boolean;
  scheduleDayLabel?: string;
  startLabel?: string;
  endLabel?: string;
}) {
  const startLabel = input.startLabel || '16:00';
  const endLabel = input.endLabel || '18:00';
  const scheduleLabel = input.scheduleDayLabel === '土曜ダイヤ'
    ? 'SATURDAY TIMETABLE'
    : 'AFTERNOON TIMETABLE';
  const compactDateLabel = input.dateLabel.replace('月', '/').replace('日', '');
  const bodyContents: Record<string, unknown>[] = [];

  if (input.trainError) {
    bodyContents.push({ type: 'text', text: '時刻表データを取得できませんでした。', size: 'sm', color: '#B91C1C', wrap: true });
  } else {
    bodyContents.push(buildTimetableDirectionBox(input.directionTitle, input.accent, input.departures));
  }

  return {
    type: 'bubble',
    // 横幅を広げて時刻・行先を見やすくし、方面ごとのカードに分離して縦の長さを抑える。
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0F172A',
      paddingAll: '20px',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC  /  TRANSIT', size: 'xs', color: '#67E8F9', weight: 'bold' },
        { type: 'text', text: '鷹の台駅 発車案内', size: 'xxl', color: '#FFFFFF', weight: 'bold', wrap: true },
        { type: 'text', text: input.directionTitle + '  •  ' + scheduleLabel + '  •  ' + compactDateLabel, size: 'sm', color: '#CBD5E1', wrap: true },
        { type: 'text', text: startLabel + ' – ' + endLabel, size: 'xs', color: '#94A3B8', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '18px',
      spacing: 'md',
      contents: bodyContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      backgroundColor: '#F8FAFC',
      spacing: 'xs',
      contents: [
        { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
      ],
    },
  };
}

function buildTransitBubbles(input: {
  dateLabel: string;
  kokubunji: TimetableDeparture[];
  higashimurayama: TimetableDeparture[];
  trainError: boolean;
  scheduleDayLabel?: string;
  startLabel?: string;
  endLabel?: string;
}) {
  const shared = {
    dateLabel: input.dateLabel,
    trainError: input.trainError,
    scheduleDayLabel: input.scheduleDayLabel,
    startLabel: input.startLabel,
    endLabel: input.endLabel,
  };
  return [
    buildTransitBubble({ ...shared, directionTitle: '国分寺方面', accent: '#2563EB', departures: input.kokubunji }),
    buildTransitBubble({ ...shared, directionTitle: '東村山方面', accent: '#0D9488', departures: input.higashimurayama }),
  ];
}

function buildClassTimetableBubble(input: {
  group: '7組' | '8組';
  dateLabel: string;
  dayKey: ClassTimetableDayKey | null;
  timetable: ClassTimetableData;
}) {
  const isSeven = input.group === '7組';
  const accent = isSeven ? '#5C9291' : '#0891B2';
  const rowBackground = isSeven ? '#EEF5F4' : '#F0F9FF';
  const rows: Record<string, unknown>[] = [];

  if (!input.dayKey) {
    rows.push({
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      cornerRadius: '10px',
      backgroundColor: rowBackground,
      contents: [
        { type: 'text', text: '明日は通常授業の時間割はありません。', size: 'sm', color: '#334155', wrap: true, weight: 'bold' },
        { type: 'text', text: '土日などのため、通常時間割は表示されません。', size: 'xs', color: '#64748B', wrap: true, margin: 'sm' },
      ],
    });
  } else {
    const slots = input.timetable[input.group][input.dayKey];
    for (const slot of slots) {
      rows.push({
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        spacing: 'sm',
        paddingAll: '9px',
        backgroundColor: rowBackground,
        cornerRadius: '9px',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            width: '42px',
            paddingAll: '6px',
            cornerRadius: '6px',
            backgroundColor: accent,
            justifyContent: 'center',
            contents: [
              { type: 'text', text: slot.period + '限', size: 'xs', color: '#FFFFFF', weight: 'bold', align: 'center' },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            flex: 1,
            spacing: 'xs',
            contents: [
              { type: 'text', text: slot.subject, size: 'sm', color: '#1E293B', weight: 'bold', wrap: true },
              { type: 'text', text: slot.teacher, size: 'xs', color: '#64748B', wrap: true },
            ],
          },
        ],
      });
    }
  }

  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  CLASS TIMETABLE',
    title: input.group + 'の時間割',
    subtitle: input.dateLabel + '  •  翌日の授業予定',
    bodyContents: rows,
  });
}

function buildSchoolEventsBubble(input: {
  today: string;
  events: EventRow[];
  eventError: boolean;
}) {
  const bodyContents: Record<string, unknown>[] = [];
  if (input.eventError) {
    bodyContents.push({
      type: 'text',
      text: '学校行事データを取得できませんでした。',
      size: 'sm',
      color: '#B91C1C',
      wrap: true,
    });
  } else if (!input.events.length) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      paddingAll: '14px',
      cornerRadius: '12px',
      backgroundColor: '#EAF2F1',
      contents: [
        { type: 'text', text: '現在、登録されている今後の学校行事はありません。', size: 'sm', color: '#315B59', weight: 'bold', wrap: true },
      ],
    });
  } else {
    for (const event of input.events) {
      const remaining = daysUntil(input.today, event.event_date);
      const remainingText = remaining === 0 ? '本日' : remaining === 1 ? 'あと1日' : 'あと' + remaining + '日';
      const countdownBackground = remaining <= 3 ? '#FCE8E7' : '#E2EFED';
      const countdownColor = remaining <= 3 ? '#B42318' : '#376C69';
      const title = String(event.title || '学校行事').slice(0, 70);
      const eventDetails: Record<string, unknown>[] = [
        { type: 'text', text: title, size: 'md', color: '#0F172A', weight: 'bold', wrap: true },
      ];
      if (event.summary) {
        eventDetails.push({
          type: 'text',
          text: String(event.summary).slice(0, 100),
          size: 'xs',
          color: '#64748B',
          wrap: true,
        });
      }

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        paddingAll: '2px',
        cornerRadius: '14px',
        backgroundColor: '#C6D6D6',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            paddingAll: '12px',
            cornerRadius: '12px',
            backgroundColor: '#F8FAFC',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                height: '3px',
                cornerRadius: '2px',
                backgroundColor: '#5C9291',
                contents: [{ type: 'filler' }],
              },
              {
                type: 'box',
                layout: 'horizontal',
                alignItems: 'center',
                contents: [
                  { type: 'text', text: 'SCHOOL CALENDAR', size: 'xxs', color: '#5C9291', weight: 'bold', flex: 1 },
                  {
                    type: 'box',
                    layout: 'vertical',
                    paddingAll: '6px',
                    cornerRadius: '18px',
                    backgroundColor: countdownBackground,
                    contents: [
                      { type: 'text', text: remainingText, size: 'xs', color: countdownColor, weight: 'bold', align: 'center' },
                    ],
                  },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                alignItems: 'center',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    width: '72px',
                    paddingAll: '10px',
                    cornerRadius: '10px',
                    backgroundColor: '#163A40',
                    justifyContent: 'center',
                    alignItems: 'center',
                    spacing: 'xs',
                    contents: [
                      { type: 'text', text: formatDateKey(event.event_date), size: 'lg', color: '#FFFFFF', weight: 'bold', align: 'center' },
                      { type: 'text', text: 'EVENT', size: 'xxs', color: '#A7D3CD', weight: 'bold', align: 'center' },
                    ],
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    spacing: 'xs',
                    contents: eventDetails,
                  },
                ],
              },
            ],
          },
        ],
      });
    }
  }

  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  SCHOOL EVENTS',
    title: '学校行事',
    subtitle: 'UPCOMING EVENTS  •  開催日・カウントダウン',
    bodyContents,
  });
}


function buildAssignmentListBubble(input: {
  today: string;
  assignments: AssignmentDigestRow[];
  overdueAssignments: AssignmentDigestRow[];
  changeEvents: ScheduleChangeDigestRow[];
  error: boolean;
}) {
  const bodyContents: Record<string, unknown>[] = [];
  const priorityLabel = (priority?: string | null) => priority === 'urgent' ? '緊急' : priority === 'important' ? '重要' : '';
  const renderAssignment = (assignment: AssignmentDigestRow, overdue: boolean) => {
    const option = assignment.subject_option ? '・' + assignment.subject_option + '向け' : '';
    const target = assignment.target_class === 'science' ? '理系クラス' + option : '全クラス';
    let dueLabel = '期限未設定';
    if (assignment.due_at) {
      const dueDate = new Date(assignment.due_at);
      const dueDateKey = dateKeyFromParts(tokyoParts(dueDate));
      const days = daysUntil(input.today, dueDateKey);
      const calendar = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dueDate);
      const remaining = overdue
        ? (days < 0 ? Math.abs(days) + '日超過' : '本日期限超過')
        : days === 0 ? '今日が期限' : 'あと' + days + '日';
      dueLabel = calendar + ' ・ ' + remaining;
    }
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: overdue ? '#FFF7F7' : '#F8FAFC',
      cornerRadius: '12px',
      paddingAll: '12px',
      spacing: 'xs',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          spacing: 'sm',
          contents: [
            { type: 'text', text: assignment.subject || 'その他', size: 'xxs', weight: 'bold', color: '#0E7490', flex: 0 },
            { type: 'text', text: target, size: 'xxs', color: '#64748B', wrap: true, flex: 1 },
            ...(priorityLabel(assignment.priority) ? [{ type: 'text', text: priorityLabel(assignment.priority), size: 'xxs', weight: 'bold', color: assignment.priority === 'urgent' ? '#B91C1C' : '#B45309' }] : []),
          ],
        },
        { type: 'text', text: assignment.title, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
        ...(assignment.details ? [{ type: 'text', text: assignment.details.replace(/\s+/g, ' ').slice(0, 110), size: 'xs', color: '#475569', wrap: true }] : []),
        { type: 'text', text: dueLabel, size: 'xs', weight: 'bold', color: overdue ? '#B91C1C' : '#1D4ED8', wrap: true },
      ],
    });
    bodyContents.push({ type: 'separator', color: '#E2E8F0' });
  };

  if (input.error) {
    bodyContents.push({ type: 'text', text: '課題一覧を取得できませんでした。CampusSyncで最新情報を確認してください。', size: 'sm', color: '#B91C1C', wrap: true });
  } else {
    bodyContents.push({ type: 'text', text: '提出期限内・期限未設定', size: 'sm', weight: 'bold', color: '#0F766E', wrap: true });
    if (!input.assignments.length) {
      bodyContents.push({ type: 'text', text: '現在、期限内に提出できる公開課題はありません。', size: 'xs', color: '#64748B', wrap: true });
    } else {
      for (const assignment of input.assignments.slice(0, 8)) renderAssignment(assignment, false);
    }

    if (input.overdueAssignments.length) {
      bodyContents.push({ type: 'separator', color: '#FECACA', margin: 'lg' });
      bodyContents.push({ type: 'text', text: '期限超過・確認用', size: 'sm', weight: 'bold', color: '#B91C1C', wrap: true });
      bodyContents.push({ type: 'text', text: '期限を過ぎた公開課題です。提出が必要かどうかは先生・Adminに確認してください。', size: 'xxs', color: '#7F1D1D', wrap: true });
      for (const assignment of input.overdueAssignments.slice(0, 8)) renderAssignment(assignment, true);
    }
  }

  if (input.changeEvents.length) {
    bodyContents.push({ type: 'separator', color: '#CBD5E1', margin: 'lg' });
    bodyContents.push({ type: 'text', text: '予定の変更・新規公開', size: 'sm', weight: 'bold', color: '#1D4ED8', wrap: true });
    for (const event of input.changeEvents.slice(0, 8)) {
      const actionLabel = event.action === 'created' ? '新規登録' : event.action === 'published' ? '公開' : event.action === 'cancelled' ? '中止・非公開' : '変更';
      const subject = event.subject ? ' ・ ' + event.subject : '';
      const dateText = (value: unknown) => {
        if (typeof value !== 'string' || !value) return '';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
      };
      const before = event.previous_value || {};
      const after = event.next_value || {};
      let beforeAfter = '';
      if (event.entity_type === 'assignment' && (before.due_at !== after.due_at)) {
        beforeAfter = '提出期限：' + (dateText(before.due_at) || '未設定') + ' → ' + (dateText(after.due_at) || '未設定');
      } else if (event.entity_type === 'exam' && (before.start_date !== after.start_date || before.end_date !== after.end_date)) {
        beforeAfter = '考査期間：' + String(before.start_date || '未設定') + '〜' + String(before.end_date || '未設定') + ' → ' + String(after.start_date || '未設定') + '〜' + String(after.end_date || '未設定');
      } else if (event.entity_type === 'mini_test' && (before.test_date !== after.test_date || before.period !== after.period)) {
        beforeAfter = '実施日時：' + String(before.test_date || '未設定') + ' ' + String(before.period || '') + '限 → ' + String(after.test_date || '未設定') + ' ' + String(after.period || '') + '限';
      }
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#EFF6FF',
        cornerRadius: '10px',
        paddingAll: '10px',
        spacing: 'xs',
        contents: [
          { type: 'text', text: actionLabel + ' ・ ' + event.title + subject, size: 'xs', weight: 'bold', color: event.priority === 'urgent' ? '#B91C1C' : '#1E40AF', wrap: true },
          { type: 'text', text: event.summary, size: 'xs', color: '#334155', wrap: true },
          ...(beforeAfter ? [{ type: 'text', text: beforeAfter, size: 'xxs', color: '#475569', wrap: true }] : []),
          ...(event.reason ? [{ type: 'text', text: '理由：' + event.reason, size: 'xxs', color: '#64748B', wrap: true }] : []),
        ],
      });
    }
  }

  bodyContents.push({ type: 'separator', color: '#E2E8F0', margin: 'lg' });
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#ECFDF5',
    cornerRadius: '12px',
    paddingAll: '13px',
    spacing: 'sm',
    contents: [
      { type: 'text', text: '課題の追加・変更はAdminパネルからも可能', size: 'sm', weight: 'bold', color: '#065F46', wrap: true },
      { type: 'text', text: 'LINE公式アカウントの1対1トークで「CSAI 課題追加」と送信して提案することもできます。提案はAdminで内容を確認・編集・承認した後に正式公開されます。', size: 'xs', color: '#334155', wrap: true },
    ],
  });
  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  ASSIGNMENTS & UPDATES',
    title: '課題・予定情報',
    subtitle: 'UPCOMING  •  OVERDUE  •  SCHEDULE CHANGES',
    bodyContents,
  });
}

function buildSchoolExamRangeBubbles(dateLabel: string, rows: SchoolExamRangeDigestRow[]): Record<string, unknown>[] {
  const section = (item: SchoolExamRangeSection): Record<string, unknown> => ({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#E2E8F0',
    cornerRadius: '12px',
    paddingAll: '2px',
    contents: [{
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FFFFFF',
      cornerRadius: '10px',
      paddingAll: '12px',
      spacing: 'sm',
      contents: [
        { type: 'text', text: item.title, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
        { type: 'text', text: item.body, size: 'xs', color: '#334155', wrap: true },
        ...(item.note ? [{ type: 'text', text: item.note, size: 'xs', weight: 'bold', color: '#B45309', wrap: true }] : []),
      ],
    }],
  });

  // One subject = one bubble; all subject bubbles stay in this single digest carousel.
  return rows.map(row => {
    const sections = Array.isArray(row.range_sections)
      ? row.range_sections.filter(item => item && typeof item.title === 'string' && typeof item.body === 'string')
      : [];
    return buildBoardBubble({
      eyebrow: '2026 2ND TERM FINAL / EXAM RANGE',
      title: '２学期期末考査｜' + row.display_subject,
      subtitle: dateLabel + ' 公開｜' + row.audience + '｜2026年度 2学期期末考査',
      bodyContents: sections.map(section),
    });
  });
}

function buildSchoolExamRangeFlex(dateLabel: string, rows: SchoolExamRangeDigestRow[]): Record<string, unknown> | null {
  const bubbles = buildSchoolExamRangeBubbles(dateLabel, rows);
  if (bubbles.length === 0) return null;
  const subjects = rows.map(row => row.display_subject).filter(Boolean);
  return {
    type: 'flex',
    altText: ('【2学期期末考査・試験範囲】' + subjects.join('・') + '。科目別カードを横にスワイプして確認できます。').slice(0, 400),
    contents: { type: 'carousel', contents: bubbles },
  };
}

function buildDailyDigest(input: {
  dateLabel: string;
  today: string;
  tomorrowDateLabel: string;
  tomorrowDayKey: ClassTimetableDayKey | null;
  timetable: ClassTimetableData;
  kokubunji: TimetableDeparture[];
  higashimurayama: TimetableDeparture[];
  trainError: boolean;
  events: EventRow[];
  eventError: boolean;
  includeClassTimetable: boolean;
  includeTrainTimetable: boolean;
  weather: WeatherDayForecast[];
  assignments: AssignmentDigestRow[];
  overdueAssignments: AssignmentDigestRow[];
  changeEvents: ScheduleChangeDigestRow[];
  assignmentError: boolean;
}) {
  const transitBubbles = input.includeTrainTimetable ? buildTransitBubbles(input) : [];
  const weatherBubble = buildWeatherForecastBubble(input.weather);
  const assignmentBubble = buildAssignmentListBubble({ today: input.today, assignments: input.assignments, overdueAssignments: input.overdueAssignments, changeEvents: input.changeEvents, error: input.assignmentError });
  const altText = '【CampusSync 16:00】' + input.dateLabel + '｜' + (input.includeTrainTimetable ? '電車時刻表・' : '') + '天気・課題一覧' + (input.includeClassTimetable?'・7組と8組の時間割':'') + '・学校行事。横にスワイプして確認できます。';

  return {
    type: 'flex',
    altText: altText.slice(0, 400),
    contents: {
      type:'carousel',
      contents:[
        ...transitBubbles,
        weatherBubble,
        ...(input.includeClassTimetable?[
          buildClassTimetableBubble({group:'7組',dateLabel:input.tomorrowDateLabel,dayKey:input.tomorrowDayKey,timetable:input.timetable}),
          buildClassTimetableBubble({group:'8組',dateLabel:input.tomorrowDateLabel,dayKey:input.tomorrowDayKey,timetable:input.timetable}),
        ]:[]),
        buildSchoolEventsBubble({today:input.today,events:input.events,eventError:input.eventError}),
        assignmentBubble,
      ],
    },
  };
}

function buildSaturdayDigest(input: {
  dateLabel: string;
  today: string;
  kokubunji: TimetableDeparture[];
  higashimurayama: TimetableDeparture[];
  trainError: boolean;
  weather: WeatherDayForecast[];
  assignments: AssignmentDigestRow[];
  overdueAssignments: AssignmentDigestRow[];
  changeEvents: ScheduleChangeDigestRow[];
  assignmentError: boolean;
}) {
  const transitBubbles = buildTransitBubbles({
    dateLabel: input.dateLabel,
    kokubunji: input.kokubunji,
    higashimurayama: input.higashimurayama,
    trainError: input.trainError,
    scheduleDayLabel: '土曜ダイヤ',
    startLabel: '12:30',
    endLabel: '14:00',
  });
  const assignmentBubble = buildAssignmentListBubble({ today: input.today, assignments: input.assignments, overdueAssignments: input.overdueAssignments, changeEvents: input.changeEvents, error: input.assignmentError });
  return {
    type: 'flex',
    altText: ('【CampusSync 土曜12:30】' + input.dateLabel + '｜鷹の台駅12:30〜14:00の時刻表・天気・課題・期限超過・予定変更。横にスワイプして確認できます。').slice(0, 400),
    contents: { type: 'carousel', contents: [...transitBubbles, buildWeatherForecastBubble(input.weather), assignmentBubble] },
  };
}

type FlexCarouselMessage = {
  contents: { type?: unknown; contents?: unknown };
};

/**
 * LINE Flex Message carousels require every bubble to use the same size.
 * Keep the transit cards' wider layout and normalize all other daily-digest
 * cards to giga before sending the carousel.
 */
function normalizeDailyDigestCarouselSize<T extends FlexCarouselMessage>(message: T): T {
  const carousel = message.contents;
  if (carousel.type !== 'carousel' || !Array.isArray(carousel.contents)) return message;

  const normalizedContents = carousel.contents.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const bubble = item as Record<string, unknown>;
    return bubble.type === 'bubble' ? { ...bubble, size: 'giga' } : item;
  });

  return {
    ...message,
    contents: { ...carousel, contents: normalizedContents },
  } as T;
}

/**
 * Split a digest carousel into LINE-safe Flex messages. LINE limits the JSON
 * definition of a carousel to 50 KB and allows up to five message objects in
 * a broadcast/push request. Use a 45 KB budget for headroom.
 */
function splitDailyDigestCarousel<T extends FlexCarouselMessage>(message: T): T[] {
  const carousel = message.contents;
  if (carousel.type !== 'carousel' || !Array.isArray(carousel.contents)) return [message];

  const maxBytes = 45 * 1024;
  const bubbles = carousel.contents;
  const chunks: unknown[][] = [];
  let current: unknown[] = [];

  const makeMessage = (items: unknown[], index: number, total: number): T => ({
    ...message,
    altText: (String((message as { altText?: unknown }).altText || 'CampusSync 日次まとめ')
      + '（' + index + '/' + total + '）').slice(0, 400),
    contents: { ...carousel, contents: items },
  } as T);

  for (const bubble of bubbles) {
    const candidate = [...current, bubble];
    const candidateMessage = makeMessage(candidate, 1, 1);
    const candidateBytes = Buffer.byteLength(JSON.stringify(candidateMessage), 'utf8');
    if (candidateBytes <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      throw new Error('日次まとめのFlexバブル単体が安全なカルーセル上限を超えています。');
    }
    chunks.push(current);
    current = [bubble];
    const singleBytes = Buffer.byteLength(JSON.stringify(makeMessage(current, 1, 1)), 'utf8');
    if (singleBytes > maxBytes) {
      throw new Error('日次まとめのFlexバブル単体が安全なカルーセル上限を超えています。');
    }
  }
  if (current.length) chunks.push(current);

  if (chunks.length > 5) {
    throw new Error('日次まとめをLINEの1リクエスト上限5メッセージ以内に分割できません。');
  }
  return chunks.map((items, index) => makeMessage(items, index + 1, chunks.length));
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { mode?: unknown; excludeTrainTimetable?: unknown };
  const manualRequest = payload.mode === 'manual';
  // A replay is still protected by CRON_SECRET, but can run after the scheduled window.
  const replayRequest = payload.mode === 'replay';
  // Replay callers may omit the railway departure cards while preserving the rest of the weekday digest.
  const excludeTrainTimetable = replayRequest && payload.excludeTrainTimetable === true;

  if (manualRequest) {
    const expectedPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const receivedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !receivedPassword || !constantTimeEqual(expectedPassword, receivedPassword)) {
      return jsonError('日次まとめの手動テストには正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const expectedSecret = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const receivedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expectedSecret || !receivedSecret || !constantTimeEqual(expectedSecret, receivedSecret)) {
      return jsonError('日次まとめの定期配信認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    return jsonError('Supabaseのサーバー設定またはLINE_CHANNEL_ACCESS_TOKENが不足しています。', 503);
  }

  const now = new Date();
  const nowParts = tokyoParts(now);
  const today = dateKeyFromParts(nowParts);
  const weekday = new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',weekday:'short'}).format(now);
  const isWeekday = ['Mon','Tue','Wed','Thu','Fri'].includes(weekday);
  const isSaturday = weekday === 'Sat';
  const includeClassTimetable = ['Mon','Tue','Wed','Thu'].includes(weekday);
  const currentHour = Number(nowParts.hour);
  const currentMinute = Number(nowParts.minute);
  const inDispatchWindow = isSaturday
    ? currentHour === 12 && currentMinute >= 30 && currentMinute < 40
    : currentHour === 16 && currentMinute < 10;
  if (!manualRequest && !replayRequest && ((!isWeekday && !isSaturday) || !inDispatchWindow)) {
    return NextResponse.json({ success: true, skipped: true, message: '平日16:00・土曜12:30に配信します。' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const todayLabel = Number(nowParts.month)+'月'+Number(nowParts.day)+'日';
  const tomorrow = getTokyoTomorrowTimetableInfo(now);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const [trainResult, eventResult, classTimetableResult, weatherResult, assignmentResult, changeResult, examRangeResult] = await Promise.all([
    admin.from('takanodai_timetable')
      .select('direction,departure_time,service,service_day')
      .eq('service_day', isSaturday ? 'saturday' : 'weekday')
      .order('direction', { ascending: true })
      .order('departure_time', { ascending: true }),
    admin.from('school_event_countdowns')
      .select('id,title,summary,event_date,is_active')
      .eq('is_active', true)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(4),
    admin.from('class_timetable_slots')
      .select('group_name,day_key,period,subject,teacher')
      .order('group_name', { ascending: true }).order('day_key', { ascending: true }).order('period', { ascending: true }),
    // 今日を除外しても明日から3日分を確保できるよう、5日分の予報を取得する。
    fetchSchoolWeatherForecast(5).catch(error=>{console.error('天気予報の取得に失敗:',error instanceof Error?error.message:'unknown');return null;}),
    admin.from('assignments')
      .select('id,title,details,subject,subject_option,target_class,due_at,is_active,priority')
      .eq('is_active', true)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(40),
    admin.from('campussync_schedule_change_events')
      .select('id,entity_type,entity_id,action,title,subject,priority,summary,previous_value,next_value,reason,created_at')
      .is('digest_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(8),
    admin.from('school_test_ranges')
      .select('subject,display_subject,audience,range_sections,sort_order')
      .eq('broadcast_on', today)
      .order('sort_order', { ascending: true }),
  ]);

  if (trainResult.error) console.error('日次まとめ：時刻表取得エラー', trainResult.error.message);
  if (eventResult.error) console.error('日次まとめ：行事取得エラー', eventResult.error.message);
  if (classTimetableResult.error) console.error('日次まとめ：時間割取得エラー（初期データへフォールバック）', classTimetableResult.error.message);
  if (assignmentResult.error) console.error('日次まとめ：課題一覧取得エラー', assignmentResult.error.message);
  if (changeResult.error) console.error('日次まとめ：予定変更一覧取得エラー', changeResult.error.message);
  if (examRangeResult.error) console.error('日次まとめ：試験範囲取得エラー', examRangeResult.error.message);

  const examRangeRows = (examRangeResult.data || []) as SchoolExamRangeDigestRow[];
  const examFlex = buildSchoolExamRangeFlex(todayLabel, examRangeRows);
  const assignmentRows = (assignmentResult.data || []) as AssignmentDigestRow[];
  const currentAssignments = assignmentRows.filter(row => !row.due_at || new Date(row.due_at).getTime() >= now.getTime()).slice(0, 8);
  const overdueAssignments = assignmentRows.filter(row => Boolean(row.due_at) && new Date(row.due_at as string).getTime() < now.getTime()).slice(0, 8);
  const changeEvents = (changeResult.data || []) as ScheduleChangeDigestRow[];
  const timetableRows = (classTimetableResult.data || []) as ClassTimetableRow[];
  const timetable: ClassTimetableData = timetableRows.length ? mapClassTimetableRows(timetableRows) : CLASS_TIMETABLE_DATA;
  const trainRows = (trainResult.data || []) as TrainRow[];
  const timetableStartMinute = isSaturday ? (12 * 60 + 30) : (16 * 60);
  const timetableEndMinute = isSaturday ? (14 * 60) : (18 * 60);
  const departures = (direction: string): TimetableDeparture[] => trainRows
    .filter(row => {
      if (row.direction !== direction) return false;
      const minute = minutesFromTimetableTime(row.departure_time);
      return minute !== null && minute >= timetableStartMinute && minute <= timetableEndMinute;
    })
    .map(row => ({
      time: String(row.departure_time).slice(0, 5),
      service: row.service ? String(row.service) : '各駅停車',
    }));
  const kokubunji = departures('kokubunji');
  const higashimurayama = departures('higashimurayama');

  const events = (eventResult.data || []) as EventRow[];
  const weatherDays = weatherResult as WeatherDayForecast[] | null;
  const forecastDays = weatherDays?.filter(day=>day.date>=tomorrow.dateKey).slice(0,3)||[];
  const flex = normalizeDailyDigestCarouselSize(isSaturday
    ? buildSaturdayDigest({
        dateLabel: todayLabel,
        today,
        kokubunji,
        higashimurayama,
        trainError: Boolean(trainResult.error),
        weather: forecastDays,
        assignments: currentAssignments,
        overdueAssignments,
        changeEvents,
        assignmentError: Boolean(assignmentResult.error),
      })
    : buildDailyDigest({
        dateLabel: todayLabel,
        today,
        tomorrowDateLabel: tomorrow.dateLabel,
        tomorrowDayKey: tomorrow.dayKey,
        timetable,
        kokubunji,
        higashimurayama,
        trainError: Boolean(trainResult.error),
        events,
        eventError: Boolean(eventResult.error),
        includeClassTimetable,
        includeTrainTimetable: !excludeTrainTimetable,
        weather: forecastDays,
        assignments: currentAssignments,
        overdueAssignments,
        changeEvents,
        assignmentError: Boolean(assignmentResult.error),
      }));
  let flexMessages: typeof flex[];
  try {
    flexMessages = splitDailyDigestCarousel(flex);
  } catch (error) {
    console.error('日次まとめのFlex分割に失敗:', error instanceof Error ? error.message : 'unknown');
    return jsonError('日次まとめのメッセージサイズを調整できませんでした。', 500);
  }

  const retryKey = stableRetryKey(today, excludeTrainTimetable ? 'weekday-no-train-timetable' : (isSaturday ? 'saturday' : 'weekday'));
  const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryKey,
    },
    body: JSON.stringify({ messages: applyCampusSyncFlexFooters(flexMessages) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  await recordLineDeliveryResponse(response, { channel: 'broadcast', kind: 'daily_digest', accessToken, retryKey, deliveryBatchId: retryKey, messages: flexMessages });

  if (!response.ok && response.status !== 409) {
    const errorBody = await response.text().catch(() => '');
    console.error('LINE日次まとめの一斉配信に失敗:', response.status, errorBody.slice(0, 500));
    return jsonError(response.status === 429
      ? 'LINEの月間通数上限または送信レート制限に達した可能性があります。'
      : 'LINEへの日次まとめ配信に失敗しました（HTTP ' + response.status + '）。', 502);
  }

  const digestTitle = excludeTrainTimetable
    ? '臨時再送 CampusSync 学校情報まとめ（電車時刻表除く）'
    : (isSaturday ? '12:30 CampusSync 土曜時刻表・天気' : '16:00 CampusSync 学校情報まとめ');
  const digestText = String((flex as { altText?: unknown }).altText || digestTitle);
  let historySaved = false;
  const historyLookup = await admin.from('line_broadcast_history').select('id').eq('delivery_batch_id', retryKey).maybeSingle();
  if (!historyLookup.error && historyLookup.data) {
    historySaved = true;
  } else {
    const historyWithBot = await admin.from('line_broadcast_history').insert({
      title: digestTitle, message: digestText, status: 'sent', sent_at: new Date().toISOString(),
      delivery_batch_id: retryKey, bot_slot: activeLineBot?.slot && activeLineBot.slot > 0 ? activeLineBot.slot : null,
    });
    if (!historyWithBot.error) historySaved = true;
    else {
      const fallback = await admin.from('line_broadcast_history').insert({
        title: digestTitle, message: digestText, status: 'sent', sent_at: new Date().toISOString(), delivery_batch_id: retryKey,
      });
      if (!fallback.error) historySaved = true;
      else console.error('日次まとめの配信履歴を保存できません:', fallback.error.message);
    }
  }
  const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken,flexMessages,retryKey,'daily_digest',retryKey);

  // Send exam scopes as an independent Flex Message after the ordinary daily digest.
  let examBroadcastAccepted = false;
  let examBroadcastError: string | null = null;
  let examGroupDelivery: Awaited<ReturnType<typeof pushLineMessagesToRegisteredChats>> | null = null;
  let examHistorySaved = false;
  if (examFlex) {
    const examRetryKey = stableRetryKey(today, 'weekday-exam-scope');
    try {
      const examResponse = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'X-Line-Retry-Key': examRetryKey,
        },
        body: JSON.stringify({ messages: applyCampusSyncFlexFooters([examFlex]) }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      await recordLineDeliveryResponse(examResponse, {
        channel: 'broadcast',
        kind: 'exam_scope',
        accessToken,
        retryKey: examRetryKey,
        deliveryBatchId: examRetryKey,
        messages: [examFlex],
      });
      examBroadcastAccepted = examResponse.ok || examResponse.status === 409;
      if (!examBroadcastAccepted) {
        examBroadcastError = (await examResponse.text().catch(() => '')).slice(0, 500) || 'LINE公式アカウントへの試験範囲配信に失敗しました。';
        console.error('LINE試験範囲Flexの一斉配信に失敗:', examResponse.status, examBroadcastError);
      } else {
        const historyLookup = await admin.from('line_broadcast_history').select('id').eq('delivery_batch_id', examRetryKey).maybeSingle();
        if (!historyLookup.error && historyLookup.data) {
          examHistorySaved = true;
        } else {
          const { error: historyError } = await admin.from('line_broadcast_history').insert({
            title: '16:00 2学期期末考査 試験範囲',
            message: String((examFlex as { altText?: unknown }).altText || '2学期期末考査 試験範囲'),
            status: 'sent',
            sent_at: new Date().toISOString(),
            delivery_batch_id: examRetryKey,
            bot_slot: activeLineBot?.slot && activeLineBot.slot > 0 ? activeLineBot.slot : null,
          });
          if (!historyError) examHistorySaved = true;
          else console.error('試験範囲Flexの配信履歴保存に失敗:', historyError.message);
        }
      }
    } catch (error) {
      examBroadcastError = error instanceof Error ? error.message : 'LINE試験範囲配信の通信エラー';
      console.error('LINE試験範囲Flexの通信エラー:', examBroadcastError);
    }

    try {
      examGroupDelivery = await pushLineMessagesToRegisteredChats(
        accessToken,
        [examFlex],
        examRetryKey,
        'exam_scope',
        examRetryKey,
      );
    } catch (error) {
      console.error('LINEグループへの試験範囲Flex配信に失敗:', error instanceof Error ? error.message : 'unknown error');
    }
  }

  // Keep schedule changes queued if any registered group push failed, so the
  // next regular digest can retry them instead of silently dropping them.
  if (changeEvents.length && !groupDelivery.lookupError && (groupDelivery.registered === 0 || groupDelivery.failed === 0)) {
    const { error: markChangesError } = await admin.from('campussync_schedule_change_events')
      .update({ digest_sent_at: new Date().toISOString() })
      .in('id', changeEvents.map(item => item.id))
      .is('digest_sent_at', null);
    if (markChangesError) console.error('日次まとめに含めた予定変更の処理済み記録に失敗:', markChangesError.message);
  }

  const flexCarouselCards = Array.isArray((flex as { contents?: { contents?: unknown[] } }).contents?.contents)
    ? (flex as { contents: { contents: unknown[] } }).contents.contents.length
    : 1;

  return NextResponse.json({
    success: true,
    date: today,
    alreadyAccepted: response.status === 409,
    content: {
      trainDepartures: kokubunji.length + higashimurayama.length,
      classTimetable:includeClassTimetable&&tomorrow.dayKey!==null,
      events:events.length,
      weather:forecastDays.length>0,
      assignments: currentAssignments.length,
      overdueAssignments: overdueAssignments.length,
      scheduleChanges: changeEvents.length,
      assignmentError: Boolean(assignmentResult.error),
      carouselCards: flexCarouselCards,
      examRangeSubjects: examRangeRows.length,
      examSeparateFlexMessage: Boolean(examFlex),
      historySaved,
    },
    groupDelivery,
    examScopeDelivery: examFlex ? {
      subjects: examRangeRows.length,
      carouselCards: Array.isArray((examFlex as { contents?: { contents?: unknown[] } }).contents?.contents)
        ? (examFlex as { contents: { contents: unknown[] } }).contents.contents.length
        : 1,
      broadcastAccepted: examBroadcastAccepted,
      broadcastError: examBroadcastError,
      groupDelivery: examGroupDelivery,
      historySaved: examHistorySaved,
    } : null,
    message: excludeTrainTimetable
      ? todayLabel + 'の臨時再送として、電車時刻表を除く天気・' + (includeClassTimetable ? '7組・8組の時間割・' : '') + '学校行事・課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery)
      : (isSaturday
        ? todayLabel + 'の12:30配信は、国分寺・東村山方面別の土曜時刻表、天気、課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery)
        : todayLabel + 'の16:00配信は、国分寺・東村山方面別の時刻表、天気' + (includeClassTimetable ? '・7組・8組' : '') + '、学校行事、課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery) + (examFlex ? ' 試験範囲7科目は別のFlex Messageで配信処理しました。' : '')),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
