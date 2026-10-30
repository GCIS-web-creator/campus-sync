import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

async function getStudentClient(request: Request) {
  const { url, key } = getConfig();
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!url || !key || !token) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const email = String(data.user.email || '').toLowerCase();
  const studentId = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/.exec(email)?.[1];
  if (!studentId) return null;

  return { client, user: data.user, studentId };
}

export async function GET(request: Request) {
  const student = await getStudentClient(request);
  if (!student) {
    return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });
  }

  const { data, error } = await student.client
    .from('lost_found_watches')
    .select('id, keyword, is_active, created_at')
    .eq('user_id', student.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('落とし物ウォッチ一覧を取得できません:', error.message);
    return NextResponse.json({
      success: false,
      message: '落とし物通知の設定を読み込めません。supabase/campus-platform-features.sql を実行してください。',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ success: true, watches: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const student = await getStudentClient(request);
  if (!student) {
    return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { keyword?: unknown } | null;
  const keyword = typeof payload?.keyword === 'string' ? payload.keyword.trim().replace(/\s+/g, ' ') : '';
  if (keyword.length < 2 || keyword.length > 40) {
    return NextResponse.json({ success: false, message: '探している物のキーワードは2〜40文字で入力してください。' }, { status: 400 });
  }

  const { data, error } = await student.client
    .from('lost_found_watches')
    .insert({
      user_id: student.user.id,
      student_id: student.studentId,
      keyword,
      is_active: true,
    })
    .select('id, keyword, is_active, created_at')
    .single();

  if (error) {
    console.error('落とし物通知の登録に失敗:', error.message);
    const duplicate = error.code === '23505';
    return NextResponse.json({
      success: false,
      message: duplicate ? '同じキーワードはすでに登録されています。' : '登録できませんでした。SupabaseのSQL設定を確認してください。',
    }, { status: duplicate ? 409 : 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ success: true, watch: data, message: '落とし物通知キーワードを登録しました。' }, { status: 201 });
}

export async function DELETE(request: Request) {
  const student = await getStudentClient(request);
  if (!student) {
    return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ success: false, message: '削除するキーワードIDが不正です。' }, { status: 400 });
  }

  const { error } = await student.client
    .from('lost_found_watches')
    .delete()
    .eq('id', id)
    .eq('user_id', student.user.id);

  if (error) {
    console.error('落とし物通知キーワードの削除に失敗:', error.message);
    return NextResponse.json({ success: false, message: '登録したキーワードを削除できませんでした。' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: '通知キーワードを削除しました。' }, { headers: { 'Cache-Control': 'no-store' } });
}
