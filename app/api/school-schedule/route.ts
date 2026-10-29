import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
function addDays(dateKey: string, amount: number): string {
  const parts = dateKey.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount)).toISOString().slice(0, 10);
}
function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isMonday(dateKey: string): boolean { return new Date(dateKey + 'T00:00:00Z').getUTCDay() === 1; }
function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function normalizeDays(weekStart: string, input: unknown): Array<Record<string, unknown>> | null {
  if (!Array.isArray(input) || input.length !== 7) return null;
  const days: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 7; index++) {
    const value = input[index] as any;
    if (!value || typeof value !== 'object') return null;
    if (value.isHoliday !== undefined && typeof value.isHoliday !== 'boolean') return null;
    if (value.isWeekendSchool !== undefined && typeof value.isWeekendSchool !== 'boolean') return null;
    const holidayName = String(value.holidayName || '').trim();
    if (holidayName.length > 100 || !Array.isArray(value.items) || value.items.length > 12) return null;
    const items: Array<Record<string, string>> = [];
    for (const rawItem of value.items) {
      if (!rawItem || typeof rawItem !== 'object') return null;
      const item = {
        id: String(rawItem.id || '').trim().slice(0, 80),
        time: String(rawItem.time || '').trim(),
        title: String(rawItem.title || '').trim(),
        location: String(rawItem.location || '').trim(),
        details: String(rawItem.details || '').trim(),
      };
      if (item.time.length > 30 || item.title.length > 120 || item.location.length > 100 || item.details.length > 800) return null;
      if (item.title || item.time || item.location || item.details) items.push(item);
    }
    const date = addDays(weekStart, index);
    days.push({ date, dayLabel: WEEKDAY_LABELS[new Date(date + 'T00:00:00Z').getUTCDay()], isHoliday: value.isHoliday === true, holidayName, isWeekendSchool: value.isWeekendSchool === true, items });
  }
  return days;
}

export async function GET(request: Request) {
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  const url = new URL(request.url);
  const requestedWeek = url.searchParams.get('weekStart');
  let targetWeek: string;
  if (requestedWeek) {
    if (!isValidDateKey(requestedWeek) || !isMonday(requestedWeek)) {
      return NextResponse.json({ message: '週の開始日は月曜日の日付を指定してください。' }, { status: 400 });
    }
    targetWeek = requestedWeek;
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const today = String(values.year) + '-' + String(values.month) + '-' + String(values.day);
    const date = new Date(today + 'T00:00:00Z');
    targetWeek = addDays(today, -((date.getUTCDay() + 6) % 7));
  }
  const { data, error } = await supabase.from('school_weekly_schedules')
    .select('week_start,title,days,updated_at').eq('week_start', targetWeek).maybeSingle();
  if (error) return NextResponse.json({ message: '学校予定表の取得に失敗しました。' }, { status: 500 });
  return NextResponse.json({ schedule: data || null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) {
    return NextResponse.json({ success: false, message: 'サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ success: false, message: 'Admin用パスワードが正しくありません。' }, { status: 401 });
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  const payload = await request.json().catch(() => null) as any;
  if (!payload || !isValidDateKey(payload.weekStart) || !isMonday(payload.weekStart)) {
    return NextResponse.json({ success: false, message: '週の開始日は月曜日の日付を指定してください。' }, { status: 400 });
  }
  const title = String(payload.title || '学校予定表').trim();
  if (!title || title.length > 100) return NextResponse.json({ success: false, message: '週タイトルは1〜100文字にしてください。' }, { status: 400 });
  const days = normalizeDays(payload.weekStart, payload.days);
  if (!days) return NextResponse.json({ success: false, message: '曜日ごとの予定データが不正です。最大12件まで登録できます。各項目の文字数も確認してください。' }, { status: 400 });
  const { data, error } = await supabase.from('school_weekly_schedules').upsert({
    week_start: payload.weekStart, title, days, updated_at: new Date().toISOString(),
  }, { onConflict: 'week_start' }).select('week_start,title,days,updated_at').single();
  if (error) {
    console.error('学校予定表の保存に失敗:', error.message);
    return NextResponse.json({ success: false, message: '学校予定表を保存できませんでした。supabase/school-weekly-schedule.sql を実行してください。' }, { status: 500 });
  }
  return NextResponse.json({ success: true, schedule: data }, { headers: { 'Cache-Control': 'no-store' } });
}
