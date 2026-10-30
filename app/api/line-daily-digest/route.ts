import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { CLASS_TIMETABLE_DATA, getTokyoTomorrowTimetableInfo } from '@/lib/class-timetable';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';
import { buildTimetableDirectionBox, type TimetableDeparture } from '@/lib/line-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TrainRow = { direction: string; departure_time: string; service?: string | null };
type EventRow = { title: string; summary?: string | null; event_date: string };

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

function stableRetryKey(dateKey: string): string {
  const chars = createHash('sha256')
    .update('campussync-daily-line-digest:' + dateKey)
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
  kokubunji: TimetableDeparture[];
  higashimurayama: TimetableDeparture[];
  trainError: boolean;
  timetableOnly?: boolean;
}) {
  const startLabel = input.timetableOnly ? '16:50' : '16:00';
  const endLabel = '18:00';
  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: '平日ダイヤ', size: 'xs', color: '#64748B' },
  ];
  if (input.trainError) {
    bodyContents.push({ type: 'text', text: '時刻表データを取得できませんでした。', size: 'sm', color: '#B91C1C', wrap: true });
  } else {
    bodyContents.push(
      buildTimetableDirectionBox('国分寺方面', '#2563EB', input.kokubunji),
      { type: 'separator', color: '#E2E8F0' },
      buildTimetableDirectionBox('東村山方面', '#0D9488', input.higashimurayama),
    );
  }

  return buildBoardBubble({
    eyebrow: 'CAMPUSSYNC  /  TRANSIT',
    title: '鷹の台駅 発車案内',
    subtitle: input.timetableOnly
      ? 'AFTERNOON TIMETABLE  •  ' + startLabel + ' – ' + endLabel
      : input.dateLabel + '  •  ' + startLabel + ' – ' + endLabel,
    bodyContents,
  });
}

function buildClassTimetableBubble(input: {
  group: '7組' | '8組';
  dateLabel: string;
  dayKey: ClassTimetableDayKey | null;
}) {
  const isSeven = input.group === '7組';
  const accent = isSeven ? '#0891B2' : '#4F46E5';
  const rowBackground = isSeven ? '#F0F9FF' : '#F5F3FF';
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
    const slots = CLASS_TIMETABLE_DATA[input.group][input.dayKey];
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
      cornerRadius: '10px',
      backgroundColor: '#FFF7ED',
      contents: [
        { type: 'text', text: '現在、登録されている今後の学校行事はありません。', size: 'sm', color: '#7C2D12', weight: 'bold', wrap: true },
      ],
    });
  } else {
    for (const event of input.events) {
      const remaining = daysUntil(input.today, event.event_date);
      const remainingText = remaining === 0 ? '本日' : remaining === 1 ? 'あと1日' : 'あと' + remaining + '日';
      const remainingColor = remaining <= 3 ? '#B91C1C' : remaining <= 7 ? '#C2410C' : '#4338CA';
      const contents: Record<string, unknown>[] = [
        {
          type: 'box',
          layout: 'horizontal',
          alignItems: 'center',
          spacing: 'sm',
          contents: [
            { type: 'text', text: formatDateKey(event.event_date), size: 'lg', color: '#C2410C', weight: 'bold', flex: 1 },
            { type: 'text', text: remainingText, size: 'xs', color: remainingColor, weight: 'bold', align: 'end' },
          ],
        },
        { type: 'text', text: String(event.title || '学校行事').slice(0, 70), size: 'sm', color: '#1E293B', weight: 'bold', wrap: true },
      ];
      if (event.summary) {
        contents.push({
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
        paddingAll: '10px',
        cornerRadius: '10px',
        backgroundColor: '#FFF7ED',
        spacing: 'xs',
        contents,
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

function buildDailyDigest(input: {
  dateLabel: string;
  today: string;
  tomorrowDateLabel: string;
  tomorrowDayKey: ClassTimetableDayKey | null;
  kokubunji: TimetableDeparture[];
  higashimurayama: TimetableDeparture[];
  trainError: boolean;
  events: EventRow[];
  eventError: boolean;
  timetableOnly?: boolean;
}) {
  const transitBubble = buildTransitBubble(input);
  const altText = input.timetableOnly
    ? '【CampusSync 16:50】' + input.dateLabel + '｜鷹の台駅の電車時刻表'
    : '【CampusSync 16:00】' + input.dateLabel + '｜電車時刻表・7組と8組の時間割・学校行事。横にスワイプして確認できます。';

  return {
    type: 'flex',
    altText: altText.slice(0, 400),
    contents: input.timetableOnly
      ? transitBubble
      : {
          type: 'carousel',
          contents: [
            transitBubble,
            buildClassTimetableBubble({
              group: '7組',
              dateLabel: input.tomorrowDateLabel,
              dayKey: input.tomorrowDayKey,
            }),
            buildClassTimetableBubble({
              group: '8組',
              dateLabel: input.tomorrowDateLabel,
              dayKey: input.tomorrowDayKey,
            }),
            buildSchoolEventsBubble({
              today: input.today,
              events: input.events,
              eventError: input.eventError,
            }),
          ],
        },
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
  const currentHour = Number(nowParts.hour);
  const currentMinute = Number(nowParts.minute);
  const regularDispatchWindow = currentHour === 16 && currentMinute < 10;
  const oneTimeOct30DispatchWindow =
    today === '2026-10-30' && currentHour === 16 && currentMinute >= 50 && currentMinute < 55;
  if (!manualRequest && !regularDispatchWindow && !oneTimeOct30DispatchWindow) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: '日次まとめは通常16:00（日本時間）、2026年10月30日のみ16:50に配信します。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }


  const todayLabel = Number(nowParts.month) + '月' + Number(nowParts.day) + '日';
  // 2026-10-30 only: limit the 16:50 digest to the train timetable.
  const timetableOnlyToday = today === '2026-10-30';
  const tomorrow = getTokyoTomorrowTimetableInfo(now);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const [trainResult, eventResult] = await Promise.all([
    admin.from('takanodai_timetable')
      .select('direction,departure_time,service')
      .order('direction', { ascending: true })
      .order('departure_time', { ascending: true }),
    admin.from('school_event_countdowns')
      .select('id,title,summary,event_date,is_active')
      .eq('is_active', true)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(4),
  ]);

  if (trainResult.error) console.error('日次まとめ：時刻表取得エラー', trainResult.error.message);
  if (eventResult.error) console.error('日次まとめ：行事取得エラー', eventResult.error.message);

  const trainRows = (trainResult.data || []) as TrainRow[];
  // 10/30臨時配信は16:50から18:00まで。通常の日次まとめは16:00から18:00まで。
  const timetableStartMinute = timetableOnlyToday ? 16 * 60 + 50 : 16 * 60;
  const timetableEndMinute = 18 * 60;
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
  const flex = buildDailyDigest({
    dateLabel: todayLabel,
    today,
    tomorrowDateLabel: tomorrow.dateLabel,
    tomorrowDayKey: tomorrow.dayKey,
    kokubunji,
    higashimurayama,
    trainError: Boolean(trainResult.error),
    events,
    eventError: Boolean(eventResult.error),
    timetableOnly: timetableOnlyToday,
  });

  const retryKey = stableRetryKey(today);
  const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryKey,
    },
    body: JSON.stringify({ messages: [flex] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok && response.status !== 409) {
    const errorBody = await response.text().catch(() => '');
    console.error('LINE日次まとめの一斉配信に失敗:', response.status, errorBody.slice(0, 500));
    return jsonError(response.status === 429
      ? 'LINEの月間通数上限または送信レート制限に達した可能性があります。'
      : 'LINEへの日次まとめ配信に失敗しました（HTTP ' + response.status + '）。', 502);
  }

  const groupDelivery = await pushLineMessagesToRegisteredChats(
    accessToken,
    [flex],
    retryKey,
    timetableOnlyToday ? 'train_timetable' : 'daily_digest',
  );

  return NextResponse.json({
    success: true,
    date: today,
    alreadyAccepted: response.status === 409,
    content: {
      trainDepartures: kokubunji.length + higashimurayama.length,
      classTimetable: timetableOnlyToday ? false : tomorrow.dayKey !== null,
      events: timetableOnlyToday ? 0 : events.length,
      carouselCards: timetableOnlyToday ? 1 : 4,
    },
    groupDelivery,
    message: (timetableOnlyToday
      ? todayLabel + 'の16:50配信は電車時刻表のみです。'
      : todayLabel + 'の16:00配信は、電車・7組・8組・学校行事の4枚カルーセルです。') +
      summarizeLineGroupDelivery(groupDelivery),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
