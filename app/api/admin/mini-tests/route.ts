import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MiniTestPayload = {
  subject?: unknown;
  title?: unknown;
  test_date?: unknown;
  period?: unknown;
  start_note?: unknown;
  duration_minutes?: unknown;
  scope?: unknown;
  notes?: unknown;
  question_count?: unknown;
  full_score?: unknown;
  target_class?: unknown;
};

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}
function authError(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  if (!getAdmin()) return fail('Supabaseサーバー設定が不足しています。', 503);
  return null;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function numberOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
}

export async function GET(request: Request) {
  const denied = authError(request); if (denied) return denied;
  const admin = getAdmin(); if (!admin) return fail('Supabase設定がありません。', 503);
  const { data, error } = await admin.from('mini_test_events')
    .select('id,subject,title,test_date,period,start_note,duration_minutes,scope,notes,question_count,full_score,target_class,audience,status,source,created_at,approved_at')
    .eq('audience', 'school')
    .order('test_date', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('Admin mini-test list failed:', error.message);
    return fail('小テスト予定を取得できませんでした。', 500);
  }
  return NextResponse.json({ success: true, events: data || [] }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  const denied = authError(request); if (denied) return denied;
  const admin = getAdmin(); if (!admin) return fail('Supabase設定がありません。', 503);
  const payload = await request.json().catch(() => null) as MiniTestPayload | null;
  if (!payload) return fail('入力内容を読み取れませんでした。', 400);

  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const testDate = payload.test_date;
  const period = numberOrNull(payload.period, 1, 12);
  const durationMinutes = numberOrNull(payload.duration_minutes, 1, 180);
  const questionCount = numberOrNull(payload.question_count, 1, 500);
  const fullScore = numberOrNull(payload.full_score, 1, 1000);
  const startNote = typeof payload.start_note === 'string' ? payload.start_note.trim() : '';
  const scope = typeof payload.scope === 'string' ? payload.scope.trim() : '';
  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : '';
  const targetClass = typeof payload.target_class === 'string' ? payload.target_class.trim() : 'all';

  if (!subject || subject.length > 80) return fail('教科は1〜80文字で入力してください。', 400);
  if (!title || title.length > 160) return fail('小テスト名は1〜160文字で入力してください。', 400);
  if (!validDate(testDate)) return fail('実施日を正しく入力してください。', 400);
  if (period === undefined) return fail('時限は1〜12限で指定してください。', 400);
  if (durationMinutes === undefined || durationMinutes === null) return fail('時間は1〜180分で指定してください。', 400);
  if (questionCount === undefined || questionCount === null || fullScore === undefined || fullScore === null) return fail('問題数と満点を確認してください。', 400);
  if (!startNote || startNote.length > 120) return fail('開始タイミングは1〜120文字で入力してください。', 400);
  if (!scope || scope.length > 1200 || notes.length > 1200) return fail('試験範囲・出題内容はそれぞれ1200文字以内で入力してください。', 400);
  if (!targetClass || targetClass.length > 80) return fail('対象は1〜80文字で入力してください。', 400);

  const { data, error } = await admin.from('mini_test_events').insert({
    subject, title, test_date: testDate, period, start_note: startNote,
    duration_minutes: durationMinutes, scope, notes, question_count: questionCount,
    full_score: fullScore, target_class: targetClass, audience: 'school',
    status: 'published', source: 'admin', created_by: null, line_user_id: null,
    approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).select('*').single();
  if (error) {
    console.error('Admin mini-test create failed:', error.message);
    return fail('小テストを保存できませんでした。', 500);
  }
  return NextResponse.json({ success: true, event: data }, { status: 201, headers: { 'Cache-Control': 'no-store, private' } });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  const denied = authError(request); if (denied) return denied;
  const admin = getAdmin(); if (!admin) return fail('Supabase設定がありません。', 503);
  const payload = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  if (typeof payload?.id !== 'string' || !payload.id.trim()) return fail('対象の小テストIDがありません。', 400);
  if (!['approve', 'reject', 'cancel'].includes(String(payload.action))) return fail('操作内容が正しくありません。', 400);

  const isReview = payload.action === 'approve' || payload.action === 'reject';
  const expectedStatus = isReview ? 'pending' : 'published';
  const nextStatus = payload.action === 'approve' ? 'published' : payload.action === 'reject' ? 'rejected' : 'cancelled';
  const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
  if (payload.action === 'approve') update.approved_at = new Date().toISOString();

  const { data, error } = await admin.from('mini_test_events')
    .update(update)
    .eq('id', payload.id)
    .eq('audience', 'school')
    .eq('status', expectedStatus)
    .select('id,status')
    .maybeSingle();
  if (error) {
    console.error('Admin mini-test status update failed:', error.message);
    return fail('小テストの状態を更新できませんでした。', 500);
  }
  if (!data) return fail('対象の小テストは既に処理されたか、見つかりません。', 409);
  return NextResponse.json({ success: true, event: data }, { headers: { 'Cache-Control': 'no-store, private' } });
}
