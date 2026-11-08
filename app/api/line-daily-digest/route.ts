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
      { type: 'text', text: '公式アカウントの1対1トークで「CSAI 課題追加」と送信すると、専用フォームが開きます。教科・対象・提出期限などを選択して登録できます。提案は管理者の承認後に正式公開されます。', size: 'xs', color: '#334155', wrap: true },
      {
        type: 'button',
        style: 'primary',
        color: '#0F766E',
        height: 'md',
        action: {
          type: 'uri',
          label: '公式アカウントを開く',
          uri: 'https://line.me/R/ti/p/%40420uwoqd',
        },
      },
    ],
  });
  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  ASSIGNMENTS',
    title: '課題一覧',
    subtitle: 'SUBJECT  •  DEADLINE  •  REMAINING DAYS',
    bodyContents,
  });
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
  weather: WeatherDayForecast[];
  assignments: AssignmentDigestRow[];
  assignmentError: boolean;
}) {
  const transitBubbles = buildTransitBubbles(input);
  const weatherBubble = buildWeatherForecastBubble(input.weather);
  const assignmentBubble = buildAssignmentListBubble({ today: input.today, assignments: input.assignments, error: input.assignmentError });
  const altText = '【CampusSync 16:00】' + input.dateLabel + '｜電車時刻表・天気・課題一覧' + (input.includeClassTimetable?'・7組と8組の時間割':'') + '・学校行事。横にスワイプして確認できます。';

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

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { mode?: unknown };
  const manualRequest = payload.mode === 'manual';

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
  if (!manualRequest && ((!isWeekday && !isSaturday) || !inDispatchWindow)) {
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
  const flex = isSaturday
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
        weather: forecastDays,
        assignments: (assignmentResult.data || []) as AssignmentDigestRow[],
        assignmentError: Boolean(assignmentResult.error),
      });

  const retryKey = stableRetryKey(today, isSaturday ? 'saturday' : 'weekday');
  const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryKey,
    },
    body: JSON.stringify({ messages: applyCampusSyncFlexFooters([flex]) }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });
  await recordLineDeliveryResponse(response, { channel: 'broadcast', kind: 'daily_digest', accessToken, retryKey, deliveryBatchId: retryKey, messages: [flex] });

  if (!response.ok && response.status !== 409) {
    const errorBody = await response.text().catch(() => '');
    console.error('LINE日次まとめの一斉配信に失敗:', response.status, errorBody.slice(0, 500));
    return jsonError(response.status === 429
      ? 'LINEの月間通数上限または送信レート制限に達した可能性があります。'
      : 'LINEへの日次まとめ配信に失敗しました（HTTP ' + response.status + '）。', 502);
  }

  const digestTitle = isSaturday ? '12:30 CampusSync 土曜時刻表・天気' : '16:00 CampusSync 学校情報まとめ';
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
  const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken,[flex],retryKey,'daily_digest',retryKey);

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
      carouselCards: isSaturday ? 4 : (includeClassTimetable ? 7 : 5),
      historySaved,
    },
    groupDelivery,
    message: isSaturday
      ? todayLabel + 'の12:30配信は、国分寺・東村山方面別の土曜時刻表、天気、課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery)
      : todayLabel + 'の16:00配信は、国分寺・東村山方面別の時刻表、天気' + (includeClassTimetable ? '・7組・8組' : '') + '、学校行事、課題一覧を配信しました。' + summarizeLineGroupDelivery(groupDelivery),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
