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
type AssignmentDigestRow = { id: string; title: string; details: string | null; subject: string | null; subject_option: string | null; target_class: string | null; due_at: string | null };

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


function buildAssignmentListBubble(input: { today: string; assignments: AssignmentDigestRow[]; error: boolean }) {
  const bodyContents: Record<string, unknown>[] = [];
  if (input.error) {
    bodyContents.push({ type: 'text', text: '課題一覧を取得できませんでした。CampusSyncで最新情報を確認してください。', size: 'sm', color: '#B91C1C', wrap: true });
  } else if (!input.assignments.length) {
    bodyContents.push({ type: 'text', text: '現在公開中の課題はありません。', size: 'sm', color: '#64748B', wrap: true });
  } else {
    for (const assignment of input.assignments.slice(0, 8)) {
      const option = assignment.subject_option ? '・' + assignment.subject_option + '向け' : '';
      const target = assignment.target_class === 'science' ? '理系クラス' + option : '全クラス';
      let dueLabel = '期限未設定';
      if (assignment.due_at) {
        const dueDate = new Date(assignment.due_at);
        const dueDateKey = dateKeyFromParts(tokyoParts(dueDate));
        const days = daysUntil(input.today, dueDateKey);
        const calendar = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(dueDate);
        const remaining = days < 0 ? Math.abs(days) + '日超過' : days === 0 ? '今日が期限' : 'あと' + days + '日';
        dueLabel = calendar + ' ・ ' + remaining;
      }
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#F8FAFC',
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
            ],
          },
          { type: 'text', text: assignment.title, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
          ...(assignment.details ? [{ type: 'text', text: assignment.details.replace(/\s+/g, ' ').slice(0, 110), size: 'xs', color: '#475569', wrap: true }] : []),
          { type: 'text', text: dueLabel, size: 'xs', weight: 'bold', color: assignment.due_at && dueLabel.includes('超過') ? '#B91C1C' : '#1D4ED8', wrap: true },
        ],
      });
      bodyContents.push({ type: 'separator', color: '#E2E8F0' });
    }
  }
  bodyContents.push({
    type: 'separator',
    color: '#E2E8F0',
    margin: 'lg',
  });
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#ECFDF5',
    cornerRadius: '12px',
    paddingAll: '13px',
    spacing: 'sm',
    contents: [
      { type: 'text', text: '課題の追加もLINE公式アカウントから', size: 'sm', weight: 'bold', color: '#065F46', wrap: true },
      { type: 'text', text: '公式アカウントの1対1トークで「CSAI 課題追加」と送信すると、LINEトーク内で教科・対象・課題名・内容・提出期限を順番に登録できます。選択ボタンと通常のメッセージ入力で完結し、送信前に内容を確認できます。提案は管理者の承認後に正式公開されます。', size: 'xs', color: '#334155', wrap: true },
    ],
  });
  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  ASSIGNMENTS',
    title: '課題一覧',
    subtitle: 'SUBJECT  •  DEADLINE  •  REMAINING DAYS',
    bodyContents,
  });
}


function buildChemistryExamRangeBubbles(dateLabel: string): Record<string, unknown>[] {
  const section = (title: string, body: string, note?: string): Record<string, unknown> => ({
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#E2E8F0',
    cornerRadius: '12px',
    paddingAll: '2px',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FFFFFF',
        cornerRadius: '10px',
        paddingAll: '12px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: title, size: 'sm', weight: 'bold', color: '#0F172A', wrap: true },
          { type: 'text', text: body, size: 'xs', color: '#334155', wrap: true },
          ...(note ? [{ type: 'text', text: note, size: 'xs', weight: 'bold', color: '#B45309', wrap: true }] : []),
        ],
      },
    ],
  });

  const textbookBubble = buildBoardBubble({
    eyebrow: 'TODAY ONLY  /  EXAM RANGE RELEASED',
    title: '２学期期末考査　化学試験範囲　が公開されました',
    subtitle: dateLabel + ' 公開｜2026年度 58期理系｜試験範囲① 教科書',
    bodyContents: [
      section(
        '教科書① 実教出版「化学 academia」',
        'p.65〜82：第3「希薄溶液の性質」・第4「コロイド」\np.82 論述問題 2・3\np.83 節末問題 3〜7\np.86 章末問題 3・4',
        '除外：p.67 発展「ラウールの法則と沸点上昇」／p.75 発展「蒸気圧と浸透圧」',
      ),
      section(
        '教科書② 実教出版「化学基礎 academia 新訂版」',
        'p.136〜164　第2節「酸と塩基」\np.164 節末問題／p.165 論述問題・グラフ問題\np.166〜182　第3節「酸化還元反応」\np.203 節末問題 1・2・3・5／p.204 論述問題 1・2\np.205〜211　特集4「滴定」\np.212 グラフ問題 1〜5／章末問題 4・5・6',
      ),
    ],
  });
  textbookBubble.size = 'giga';

  const workbookBubble = buildBoardBubble({
    eyebrow: 'CHEMISTRY EXAM  /  WORKBOOK & NOTES',
    title: '問題集・当日注意・提出物',
    subtitle: dateLabel + ' 公開｜2026年度 58期理系｜試験範囲②',
    bodyContents: [
      section(
        '問題集「エクセル 化学 総合版 化学基礎＋化学」',
        '6「酸・塩基」 p.100〜121\n7「酸化還元反応」 p.122〜133\n＋α：問題番号210 COD／211 DO／212 アスコルビン酸の定量\n12「溶液の性質」内の4「溶液の性質」\nWU 3〜5／基本例題51／基本問題261〜267\n応用例題53・54／応用問題269〜275',
      ),
      section(
        '重要問題集',
        '問題番号72・73「コロイド」も含みます。\n重要問題集は冬休みの宿題です。時間に余裕がある人は、実力確認のため挑戦してください。',
      ),
      section(
        '試験当日の注意',
        '原子量は与えられます。\n持ち込み・利用できるのは、計算機能のみの計算機・電卓です。\n携帯電話・スマホ・電子辞書などの計算機能は使用できません。',
      ),
      section(
        '学習ポイント・提出物',
        '教科書の用語を覚え、エクセルの基本問題・エクササイズを繰り返しましょう。標準例題・標準問題・範囲の発展問題も学習。有効数字にこだわる計算もあります。\n提出物：問題集（エクセル）用ノート（期末試験範囲）\n提出日：試験終了日 11月27日\n提出場所：化学準備室の机上に名前順に並べて提出。',
      ),
    ],
  });
  workbookBubble.size = 'giga';

  return [textbookBubble, workbookBubble];
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
  assignmentError: boolean;
}) {
  const transitBubbles = input.includeTrainTimetable ? buildTransitBubbles(input) : [];
  const weatherBubble = buildWeatherForecastBubble(input.weather);
  const assignmentBubble = buildAssignmentListBubble({ today: input.today, assignments: input.assignments, error: input.assignmentError });
  const examScopeBubbles = input.today === '2026-11-09' ? buildChemistryExamRangeBubbles(input.dateLabel) : [];
  const altText = '【CampusSync 16:00】' + input.dateLabel + '｜' + (input.includeTrainTimetable ? '電車時刻表・' : '') + '天気・課題一覧' + (input.includeClassTimetable?'・7組と8組の時間割':'') + '・学校行事' + (examScopeBubbles.length ? '・本日限定：２学期期末考査「化学」試験範囲公開（教科書・問題集）' : '') + '。横にスワイプして確認できます。';

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
        ...examScopeBubbles,
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
  const assignmentBubble = buildAssignmentListBubble({ today: input.today, assignments: input.assignments, error: input.assignmentError });
  return {
    type: 'flex',
    altText: ('【CampusSync 土曜12:30】' + input.dateLabel + '｜鷹の台駅12:30〜14:00の時刻表・天気・課題一覧。横にスワイプして確認できます。').slice(0, 400),
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

  const [trainResult, eventResult, classTimetableResult, weatherResult, assignmentResult] = await Promise.all([
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
      .select('id,title,details,subject,subject_option,target_class,due_at,is_active')
      .eq('is_active', true)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(8),
  ]);

  if (trainResult.error) console.error('日次まとめ：時刻表取得エラー', trainResult.error.message);
  if (eventResult.error) console.error('日次まとめ：行事取得エラー', eventResult.error.message);
  if (classTimetableResult.error) console.error('日次まとめ：時間割取得エラー（初期データへフォールバック）', classTimetableResult.error.message);
  if (assignmentResult.error) console.error('日次まとめ：課題一覧取得エラー', assignmentResult.error.message);

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
        assignments: (assignmentResult.data || []) as AssignmentDigestRow[],
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
        assignments: (assignmentResult.data || []) as AssignmentDigestRow[],
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

  return NextResponse.json({
    success: true,
    date: today,
    alreadyAccepted: response.status === 409,
    content: {
      trainDepartures: kokubunji.length + higashimurayama.length,
      classTimetable:includeClassTimetable&&tomorrow.dayKey!==null,
      events:events.length,
      weather:forecastDays.length>0,
      assignments: ((assignmentResult.data || []) as AssignmentDigestRow[]).length,
      assignmentError: Boolean(assignmentResult.error),
      carouselCards: isSaturday ? 4 : (includeClassTimetable ? 7 : 5) - (excludeTrainTimetable ? 2 : 0) + (today === '2026-11-09' ? 2 : 0),
      chemistryExamScope: today === '2026-11-09',
      historySaved,
    },
    groupDelivery,
    message: excludeTrainTimetable
      ? todayLabel + 'の臨時再送として、電車時刻表を除く天気・' + (includeClassTimetable ? '7組・8組の時間割・' : '') + '学校行事・課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery)
      : (isSaturday
        ? todayLabel + 'の12:30配信は、国分寺・東村山方面別の土曜時刻表、天気、課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery)
        : todayLabel + 'の16:00配信は、国分寺・東村山方面別の時刻表、天気' + (includeClassTimetable ? '・7組・8組' : '') + '、学校行事、課題一覧' + (today === '2026-11-09' ? '、本日限定の化学試験範囲' : '') + 'を配信しました。' + summarizeLineGroupDelivery(groupDelivery)),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
