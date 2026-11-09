import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); } catch { return false; }
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
export async function GET(request: Request) {
  const denied = authError(request); if (denied) return denied;
  const admin = getAdmin(); if (!admin) return fail('Supabase設定がありません。', 503);
  const { data, error } = await admin.from('mini_test_events')
    .select('id,subject,title,test_date,scope,notes,audience,status,source,line_user_id,target_class,created_at')
    .eq('source', 'line').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
  if (error) return fail('LINE小テスト登録の確認に失敗しました。', 500);
  return NextResponse.json({ success: true, pending: data || [] }, { headers: { 'Cache-Control': 'no-store, private' } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  const denied = authError(request); if (denied) return denied;
  const admin = getAdmin(); if (!admin) return fail('Supabase設定がありません。', 503);
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown; target_class?: unknown } | null;
  if (typeof body?.id !== 'string' || !['approve', 'reject'].includes(String(body.action))) return fail('操作内容を確認してください。', 400);
  const targetClass = body.target_class == null || body.target_class === '' ? null : String(body.target_class).slice(0, 40);
  const patch = body.action === 'approve'
    ? { status: 'published', audience: 'school', target_class: targetClass, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { status: 'rejected', updated_at: new Date().toISOString() };
  const { data, error } = await admin.from('mini_test_events').update(patch)
    .eq('id', body.id).eq('source', 'line').eq('status', 'pending')
    .select('id,status,audience,target_class').maybeSingle();
  if (error) return fail('小テスト予定の更新に失敗しました。', 500);
  if (!data) return fail('対象の申請が見つからないか、すでに処理されています。', 404);
  return NextResponse.json({ success: true, event: data }, { headers: { 'Cache-Control': 'no-store, private' } });
}
