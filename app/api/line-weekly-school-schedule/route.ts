import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWeeklySchoolScheduleFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function addDays(dateKey: string, amount: number): string {
  const parts = dateKey.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount)).toISOString().slice(0, 10);
}
function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isMonday(dateKey: string): boolean { return new Date(dateKey + 'T00:00:00Z').getUTCDay() === 1; }
function getNextSchoolWeekStart(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = String(values.year) + '-' + String(values.month) + '-' + String(values.day);
  const weekday = new Date(today + 'T00:00:00Z').getUTCDay();
  return addDays(today, (8 - weekday) % 7 || 7);
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
function retryKeyForWeek(weekStart: string): string {
  const chars = createHash('sha256').update('campussync-weekly-school-schedule:' + weekStart).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { mode?: unknown; weekStart?: unknown };
  const manualRequest = payload.mode === 'manual';
  if (manualRequest) {
    const expectedPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const receivedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !receivedPassword || !constantTimeEqual(expectedPassword, receivedPassword)) {
      return jsonError('学校予定表の手動配信には正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const expectedSecret = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const receivedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!expectedSecret || !receivedSecret || !constantTimeEqual(expectedSecret, receivedSecret)) {
      return jsonError('学校予定表の定期配信認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!supabaseUrl || !serviceKey || !accessToken) {
    return jsonError('Supabaseの設定と現在使用中のLINE BOTのアクセストークンを確認してください。', 503);
  }
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const weekStart = manualRequest ? String(payload.weekStart || '') : getNextSchoolWeekStart();
  if (!isDateKey(weekStart) || !isMonday(weekStart)) return jsonError('送信週は月曜日の日付で指定してください。', 400);

  const { data: schedule, error } = await supabase.from('school_weekly_schedules')
    .select('week_start,title,days').eq('week_start', weekStart).maybeSingle();
  if (error) {
    console.error('学校予定表をLINE送信前に取得できません:', error.message);
    return jsonError('学校予定表を取得できません。supabase/school-weekly-schedule.sql を実行してください。', 500);
  }
  if (!schedule) {
    if (manualRequest) return jsonError('選択した週の予定表がまだ保存されていません。先に予定表を保存してください。', 404);
    return NextResponse.json({ success: true, skipped: true, message: '送信対象週の学校予定表が未登録のため、LINE配信をスキップしました。' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const days = Array.isArray(schedule.days) ? schedule.days as Array<any> : [];
  const hasContent = days.some(day => day?.isHoliday || String(day?.holidayName || '').trim() || (Array.isArray(day?.items) && day.items.some((item: any) => String(item?.title || item?.details || item?.time || item?.location || '').trim())));
  if (!hasContent) {
    if (manualRequest) return jsonError('予定または祝日設定がないため、配信できません。', 400);
    return NextResponse.json({ success: true, skipped: true, message: '予定・祝日が未入力のため、LINE配信をスキップしました。' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const flex = buildWeeklySchoolScheduleFlexMessage({ title: String(schedule.title || '学校予定表'), weekStart, days });
  const retryKey = manualRequest ? randomUUID() : retryKeyForWeek(weekStart);
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey },
      body: JSON.stringify({ messages: [flex] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok && response.status !== 409) {
      const errorBody = await response.text().catch(() => '');
      console.error('学校予定表のLINE配信に失敗:', response.status, errorBody.slice(0, 500));
      return jsonError(response.status === 429 ? 'LINEの送信上限・レート制限に達した可能性があります。' : 'LINEへの学校予定表配信に失敗しました（HTTP ' + response.status + '）。', 502);
    }
    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, [flex], retryKey, 'school_schedule');
    const groupMessage = summarizeLineGroupDelivery(groupDelivery);
    const weekEnd = addDays(weekStart, 6);
    return NextResponse.json({
      success: true, weekStart, groupDelivery,
      message: weekStart + '〜' + weekEnd + ' の学校予定表をLINE公式アカウントへ送信しました。' + groupMessage,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学校予定表のLINE配信通信エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('LINEへの学校予定表配信に失敗しました。Vercelのログを確認してください。', 502);
  }
}
