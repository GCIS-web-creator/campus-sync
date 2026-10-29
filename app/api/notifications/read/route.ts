import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function config() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getUser(request: Request) {
  const { url, key } = config();
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!url || !key || !token) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

function adminClient() {
  const { url, serviceRole } = config();
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ message: '学校アカウントでログインしてください。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  const { data, error } = await admin.from('notification_reads').select('notification_id').eq('user_id', user.id);
  if (error) {
    console.error('通知の既読一覧を取得できません:', error.message);
    return NextResponse.json({ message: '通知の既読状態を取得できませんでした。SQL設定を確認してください。' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ readIds: (data || []).map(row => String(row.notification_id)) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ message: '学校アカウントでログインしてください。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ message: '通知IDを読み取れませんでした。' }, { status: 400 });
  }
  const notificationId = payload && typeof payload === 'object' && 'notificationId' in payload
    ? String((payload as { notificationId?: unknown }).notificationId ?? '').trim()
    : '';
  if (!notificationId || notificationId.length > 200) return NextResponse.json({ message: '通知IDが不正です。' }, { status: 400 });
  const { error } = await admin.from('notification_reads').upsert({
    user_id: user.id, notification_id: notificationId, read_at: new Date().toISOString(),
  }, { onConflict: 'user_id,notification_id' });
  if (error) {
    console.error('通知の既読状態保存に失敗:', error.message);
    return NextResponse.json({ message: '通知の既読状態を保存できませんでした。SQL設定を確認してください。' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ success: true, notificationId }, { headers: { 'Cache-Control': 'no-store' } });
}
