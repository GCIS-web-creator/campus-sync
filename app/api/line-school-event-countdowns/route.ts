import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildSchoolEventCountdownFlexMessages } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type EventRow = { id: string; title: string; summary: string; event_date: string; is_active: boolean };

const DAILY_EVENT_LIMIT = 4;

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokyoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function daysUntil(today: string, eventDate: string): number {
  const a = today.split('-').map(Number);
  const b = eventDate.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function retryKey(date: string, index: number): string {
  const chars = createHash('sha256').update('campussync-school-event-countdowns:' + date + ':' + index).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { mode?: unknown };
  const manualRequest = payload.mode === 'manual';
  if (manualRequest) {
    const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const received = request.headers.get('x-admin-password') || '';
    if (!expected || !received || !constantTimeEqual(expected, received)) {
      return jsonError('手動配信には正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const expected = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const received = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expected || !received || !constantTimeEqual(expected, received)) {
      return jsonError('カウントダウン定期配信の認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!supabaseUrl || !serviceKey || !accessToken) {
    return jsonError('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / LINE_CHANNEL_ACCESS_TOKEN を設定してください。', 503);
  }
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const today = tokyoToday();
  const { data, error } = await supabase.from('school_event_countdowns')
    .select('id,title,summary,event_date,is_active')
    .eq('is_active', true)
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .limit(DAILY_EVENT_LIMIT);

  if (error) {
    console.error('カウントダウンイベント取得エラー:', error.message);
    return jsonError('イベントを取得できません。supabase/school-event-countdowns.sql を実行してください。', 500);
  }

  // Notify the four nearest active upcoming events every day, regardless of
  // how many days remain until each event.
  const matches = ((data || []) as EventRow[])
    .slice(0, DAILY_EVENT_LIMIT)
    .map(event => ({ ...event, daysRemaining: daysUntil(today, event.event_date) }));

  if (!matches.length) {
    return NextResponse.json({ success: true, skipped: true, date: today, count: 0, message: today + ' 以降に配信対象の有効なイベントはありません。' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const flexMessages = buildSchoolEventCountdownFlexMessages(matches.map(event => ({
    title: event.title,
    summary: event.summary,
    eventDate: event.event_date,
    daysRemaining: event.daysRemaining,
  })));

  const broadcastResults: Array<{ batch: number; sent: boolean; status?: number }> = [];
  for (let offset = 0, batch = 0; offset < flexMessages.length; offset += 5, batch += 1) {
    const messages = flexMessages.slice(offset, offset + 5);
    try {
      const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'X-Line-Retry-Key': manualRequest ? randomUUID() : retryKey(today, batch),
        },
        body: JSON.stringify({ messages }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      const ok = response.ok || response.status === 409;
      if (!ok) {
        const errorBody = await response.text().catch(() => '');
        console.error('カウントダウンLINE一斉配信に失敗:', response.status, errorBody.slice(0, 500));
      }
      broadcastResults.push({ batch, sent: ok, status: response.status });
    } catch (error) {
      console.error('カウントダウンLINE一斉配信の通信エラー:', error instanceof Error ? error.message : 'unknown error');
      broadcastResults.push({ batch, sent: false });
    }
  }

  const failures = broadcastResults.filter(result => !result.sent);
  const groupResults = await Promise.all(
    Array.from({ length: Math.ceil(flexMessages.length / 5) }, (_, batch) =>
      pushLineMessagesToRegisteredChats(
        accessToken,
        flexMessages.slice(batch * 5, batch * 5 + 5),
        manualRequest ? randomUUID() : 'countdown:' + today + ':' + batch,
        'school_schedule',
      ),
    ),
  );
  const groupSummary = groupResults.map(summarizeLineGroupDelivery).join(' ');

  return NextResponse.json({
    success: failures.length === 0,
    date: today,
    count: matches.length,
    events: matches.map(event => ({ title: event.title, event_date: event.event_date, daysRemaining: event.daysRemaining })),
    broadcasts: broadcastResults,
    groupDelivery: groupResults,
    message: today + ' の直近イベント配信対象は' + matches.length + '件です（最大4件）。' +
      (failures.length ? ' LINE全体配信の一部に失敗しました。Vercelのログを確認してください。' : ' LINE公式アカウントへFlex Messageを送信しました。') +
      ' ' + groupSummary,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
