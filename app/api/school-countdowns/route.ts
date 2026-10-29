import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAdmin(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  return Boolean(expected && received && constantTimeEqual(expected, received));
}

function tokyoToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const passwordProvided = request.headers.has('x-admin-password');
  const admin = isAdmin(request);
  if (passwordProvided && !admin) return jsonError('Admin用パスワードが正しくありません。', 401);
  let query = supabase.from('school_event_countdowns')
    .select('id,title,summary,event_date,is_active,created_at,updated_at')
    .order('event_date', { ascending: true });
  if (!admin) query = query.eq('is_active', true).gte('event_date', tokyoToday());

  const { data, error } = await query;
  if (error) {
    console.error('学校イベント・カウントダウン取得エラー:', error.message);
    return jsonError('イベントを取得できません。先に supabase/school-event-countdowns.sql を実行してください。', 500);
  }
  return NextResponse.json({ events: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) {
    return jsonError('サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。', 503);
  }
  if (!isAdmin(request)) return jsonError('Admin用パスワードが正しくありません。', 401);
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const payload = await request.json().catch(() => null) as any;
  if (!payload || typeof payload !== 'object') return jsonError('送信データが不正です。', 400);
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : '';
  const title = String(payload.title || '').trim();
  const summary = String(payload.summary || '').trim();
  const eventDate = payload.eventDate;
  const isActive = payload.isActive !== false;
  if (!title || title.length > 120) return jsonError('タイトルは1〜120文字で入力してください。', 400);
  if (summary.length > 1200) return jsonError('概要は1200文字以内にしてください。', 400);
  if (!isDateKey(eventDate)) return jsonError('開催日を正しい日付で指定してください。', 400);

  const values = {
    title,
    summary,
    event_date: eventDate,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  const result = id
    ? await supabase.from('school_event_countdowns').update(values).eq('id', id).select('id,title,summary,event_date,is_active,created_at,updated_at').maybeSingle()
    : await supabase.from('school_event_countdowns').insert(values).select('id,title,summary,event_date,is_active,created_at,updated_at').single();

  if (result.error) {
    console.error('学校イベント・カウントダウン保存エラー:', result.error.message);
    return jsonError('イベントを保存できません。テーブル設定と入力内容を確認してください。', 500);
  }
  if (!result.data) return jsonError('編集対象のイベントが見つかりません。', 404);
  return NextResponse.json({ success: true, event: result.data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) {
    return jsonError('サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。', 503);
  }
  if (!isAdmin(request)) return jsonError('Admin用パスワードが正しくありません。', 401);
  const supabase = getAdminSupabase();
  if (!supabase) return jsonError('Supabaseのサーバー設定が不足しています。', 503);
  const payload = await request.json().catch(() => null) as any;
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!id || id.length > 80) return jsonError('削除するイベントIDが不正です。', 400);

  const { data, error } = await supabase.from('school_event_countdowns').delete().eq('id', id).select('id').maybeSingle();
  if (error) {
    console.error('学校イベント・カウントダウン削除エラー:', error.message);
    return jsonError('イベントを削除できません。', 500);
  }
  if (!data) return jsonError('削除対象のイベントが見つかりません。', 404);
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
