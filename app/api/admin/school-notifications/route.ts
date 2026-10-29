import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SchoolNotificationPayload = {
  title?: unknown;
  body?: unknown;
};

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function authorize(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: 'CAMPUS_SYNC_ADMIN_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY をVercelの環境変数に設定してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { message: 'Admin用パスワードが正しくありません。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, body, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('学園総合通知履歴の取得に失敗:', error.message);
    return NextResponse.json(
      { message: `通知履歴を取得できませんでした。supabase/school-notifications.sql を実行したか確認してください。詳細: ${error.message}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { notifications: data || [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 });
  }
  if (!rawPayload || typeof rawPayload !== 'object') {
    return NextResponse.json({ message: '送信データの形式が不正です。' }, { status: 400 });
  }
  const payload = rawPayload as SchoolNotificationPayload;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!title || !body) {
    return NextResponse.json({ message: 'タイトルと本文の両方を入力してください。' }, { status: 400 });
  }
  if (Array.from(title).length > 100 || Array.from(body).length > 1800) {
    return NextResponse.json({ message: 'タイトルは100文字以内、本文は1,800文字以内にしてください。' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({ title, body })
    .select('id, title, body, created_at')
    .single();

  if (error) {
    console.error('学園総合通知の公開に失敗:', error.message);
    return NextResponse.json(
      { message: `通知を公開できませんでした。Supabaseのテーブル設定を確認してください。詳細: ${error.message}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { success: true, notification: data, message: `「${title}」を学園総合通知に全校公開しました。` },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
