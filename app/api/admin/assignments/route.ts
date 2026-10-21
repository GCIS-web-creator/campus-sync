import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignmentPayload = {
  id?: string;
  title?: string;
  details?: string;
  source?: string;
  type?: string;
  due?: string | null;
  due_at?: string | null;
  is_active?: boolean;
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorizedOrMisconfigured(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ message: 'サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。' }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: '管理用パスワードが正しくありません。' }, { status: 401 });
  }
  return null;
}

function validatePayload(payload: AssignmentPayload): string | null {
  if (!payload.title?.trim()) return '課題名を入力してください。';
  if (payload.title.trim().length > 200) return '課題名は200文字以内にしてください。';
  if ((payload.details || '').length > 5000) return '詳細は5000文字以内にしてください。';
  if (payload.due_at && Number.isNaN(new Date(payload.due_at).getTime())) return '提出期限の日付と時刻が不正です。';
  if (payload.type && !['paper', 'classroom', 'other'].includes(payload.type)) return '課題の種類が不正です。';
  return null;
}

export async function GET(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, details, source, type, due, due_at, is_active, created_at, classroom_course_id, classroom_coursework_id')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ message: `課題の取得に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ assignments: data || [] });
}

export async function POST(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').insert(record).select('*').single();
  if (error) return NextResponse.json({ message: `課題の保存に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ assignment: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '編集対象の課題IDがありません。' }, { status: 400 });
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: payload.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').update(record).eq('id', payload.id).select('*').maybeSingle();
  if (error) return NextResponse.json({ message: `課題の更新に失敗しました: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ message: '対象の課題が見つかりません。' }, { status: 404 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: { id?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '削除対象の課題IDがありません。' }, { status: 400 });
  const { error } = await supabase.from('assignments').delete().eq('id', payload.id);
  if (error) return NextResponse.json({ message: `課題の削除に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ success: true });
}
