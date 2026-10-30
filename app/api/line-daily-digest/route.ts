import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { CLASS_TIMETABLE_DATA, getTokyoTomorrowTimetableInfo } from '@/lib/class-timetable';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type TrainRow = { direction: string; departure_time: string; service?: string | null };
type AssignmentRow = { title: string; source?: string | null; due_at: string; due?: string | null };
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

function formatDueAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function section(title: string, body: string, accent: string): Record<string, unknown> {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'lg',
    contents: [
      { type: 'text', text: title, size: 'md', weight: 'bold', color: accent, wrap: true },
      { type: 'text', text: body, size: 'sm', color: '#334155', wrap: true },
    ],
  };
}

function buildDailyDigest(input: {
  dateLabel: string;
  trainText: string;
  classText: string;
  assignmentText: string;
  eventText: string;
  timetableOnly?: boolean;
}) {
  const sections = input.timetableOnly
    ? [section('🚃 鷹の台駅｜16:50〜18:00', input.trainText, '#1D4ED8')]
    : [
        section('🚃 鷹の台駅｜16:00〜18:00', input.trainText, '#1D4ED8'),
        { type: 'separator', color: '#E2E8F0', margin: 'lg' },
        section('📚 明日の時間割｜7組・8組', input.classText, '#0F766E'),
        { type: 'separator', color: '#E2E8F0', margin: 'lg' },
        section('📝 48時間以内の提出期限', input.assignmentText, '#B45309'),
        { type: 'separator', color: '#E2E8F0', margin: 'lg' },
        section('📅 近日の学校行事', input.eventText, '#6D28D9'),
      ];
  return {
    type: 'flex',
    altText: (input.timetableOnly
      ? '【CampusSync 16:50】' + input.dateLabel + '｜電車時刻表'
      : '【CampusSync 16:00まとめ】' + input.dateLabel + '｜時刻表・明日の時間割・課題期限・学校行事').slice(0, 400),
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        backgroundColor: '#0F172A',
        spacing: 'xs',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  DAILY BRIEF', size: 'xs', color: '#67E8F9', weight: 'bold' },
          { type: 'text', text: input.timetableOnly ? '電車時刻表のお知らせ' : '今日の学校情報まとめ', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: input.dateLabel + (input.timetableOnly ? '  •  本日16:50配信' : '  •  毎日16:00配信'), size: 'xs', color: '#CBD5E1', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'none',
        contents: sections,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        backgroundColor: '#F8FAFC',
        spacing: 'xs',
        contents: [
          { type: 'text', text: '詳細・最新情報はCampusSyncで確認してください。', size: 'xs', color: '#475569', wrap: true },
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
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

  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const [trainResult, assignmentResult, eventResult] = await Promise.all([
    admin.from('takanodai_timetable')
      .select('direction,departure_time,service')
      .order('direction', { ascending: true })
      .order('departure_time', { ascending: true }),
    admin.from('assignments')
      .select('id,title,source,type,due_at,due')
      .eq('is_active', true)
      .not('due_at', 'is', null)
      .gte('due_at', now.toISOString())
      .lte('due_at', horizon.toISOString())
      .order('due_at', { ascending: true })
      .limit(12),
    admin.from('school_event_countdowns')
      .select('id,title,summary,event_date,is_active')
      .eq('is_active', true)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(4),
  ]);

  if (trainResult.error) console.error('日次まとめ：時刻表取得エラー', trainResult.error.message);
  if (assignmentResult.error) console.error('日次まとめ：課題取得エラー', assignmentResult.error.message);
  if (eventResult.error) console.error('日次まとめ：行事取得エラー', eventResult.error.message);

  const trainRows = (trainResult.data || []) as TrainRow[];
  // 10/30臨時配信は16:50から18:00まで。通常の日次まとめは16:00から18:00まで。
  const timetableStartMinute = timetableOnlyToday ? 16 * 60 + 50 : 16 * 60;
  const timetableEndMinute = 18 * 60;
  const departures = (direction: string) => trainRows
    .filter(row => row.direction === direction)
    .map(row => {
      const minute = minutesFromTimetableTime(row.departure_time);
      if (minute === null || minute < timetableStartMinute || minute > timetableEndMinute) return null;
      return String(row.departure_time).slice(0, 5) + (row.service ? ' ' + String(row.service).slice(0, 12) : '');
    })
    .filter((value): value is string => value !== null);
  const kokubunji = departures('kokubunji');
  const higashimurayama = departures('higashimurayama');
  const trainText = trainResult.error
    ? '時刻表データを取得できませんでした。'
    : '平日ダイヤ\n国分寺方面（' + kokubunji.length + '本）\n' + (kokubunji.length ? kokubunji.join('　') : '該当する発車予定はありません。')
      + '\n\n東村山方面（' + higashimurayama.length + '本）\n' + (higashimurayama.length ? higashimurayama.join('　') : '該当する発車予定はありません。');

  let classText = tomorrow.dateLabel + '\n';
  if (!tomorrow.dayKey) {
    classText += '土日などのため、通常時間割はありません。';
  } else {
    const seven = CLASS_TIMETABLE_DATA['7組'][tomorrow.dayKey]
      .map(slot => slot.period + '限 ' + slot.subject).join(' ／ ');
    const eight = CLASS_TIMETABLE_DATA['8組'][tomorrow.dayKey]
      .map(slot => slot.period + '限 ' + slot.subject).join(' ／ ');
    classText += '7組：' + seven + '\n\n8組：' + eight;
  }

  const assignments = (assignmentResult.data || []) as AssignmentRow[];
  const assignmentText = assignmentResult.error
    ? '課題期限を取得できませんでした。'
    : assignments.length
      ? assignments.slice(0, 8).map(item =>
          '・' + String(item.title || '課題名未設定').slice(0, 72) + '\n　期限 ' + formatDueAt(item.due_at)
        ).join('\n\n') + (assignments.length > 8 ? '\n\nほか' + (assignments.length - 8) + '件' : '')
      : '今後48時間以内に期限を迎える公開中の課題はありません。';

  const events = (eventResult.data || []) as EventRow[];
  const eventText = eventResult.error
    ? '学校行事データを取得できませんでした。'
    : events.length
      ? events.map(event => {
          const remaining = daysUntil(today, event.event_date);
          return '・' + String(event.title || '行事').slice(0, 60)
            + '｜' + formatDateKey(event.event_date)
            + (remaining === 0 ? '（本日）' : '（あと' + remaining + '日）')
            + (event.summary ? '\n　' + String(event.summary).slice(0, 90) : '');
        }).join('\n\n')
      : '現在、登録されている今後の学校行事はありません。';

  const flex = buildDailyDigest({
    dateLabel: todayLabel,
    trainText: trainText.slice(0, 1500),
    classText: classText.slice(0, 1500),
    assignmentText: assignmentText.slice(0, 1500),
    eventText: eventText.slice(0, 1000),
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
      assignments: timetableOnlyToday ? 0 : assignments.length,
      events: timetableOnlyToday ? 0 : events.length,
    },
    groupDelivery,
    message: (timetableOnlyToday
      ? todayLabel + 'の16:50配信は電車時刻表のみです。'
      : todayLabel + 'の時刻表・翌日時間割・課題期限・学校行事を、16:00のFlex Message 1通にまとめて配信しました。') +
      summarizeLineGroupDelivery(groupDelivery),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
