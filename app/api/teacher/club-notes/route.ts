import { NextResponse } from 'next/server';
import {
  clearTeacherSessionCookie,
  getTeacherAccessAdmin,
  getTeacherSessionToken,
  getTokyoDateKey,
  hashTeacherSecret,
  isSameOriginRequest,
} from '@/lib/teacher-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };

async function getAuthorizedTeacherAdmin(request: Request) {
  if (!isSameOriginRequest(request)) return null;

  const admin = getTeacherAccessAdmin();
  const token = getTeacherSessionToken(request);
  if (!admin || !token) return null;

  const { data: session, error: sessionError } = await admin
    .from('teacher_access_sessions')
    .select('id, access_code_id, expires_at, session_generation')
    .eq('session_token_hash', hashTeacherSecret(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (sessionError || !session) return null;

  const { data: code, error: codeError } = await admin
    .from('teacher_access_codes')
    .select('display_name, starts_on, ends_on, is_active, session_generation')
    .eq('id', session.access_code_id)
    .maybeSingle();

  const today = getTokyoDateKey();
  if (
    codeError ||
    !code ||
    !code.is_active ||
    Number(session.session_generation) !== Number(code.session_generation) ||
    today < code.starts_on ||
    today > code.ends_on
  ) {
    return null;
  }

  await admin
    .from('teacher_access_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id);

  return admin;
}

export async function GET(request: Request) {
  const admin = await getAuthorizedTeacherAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, message: '先生用セッションの有効期限が切れています。再ログインしてください。' },
      {
        status: 401,
        headers: { ...noStore, 'Set-Cookie': clearTeacherSessionCookie() },
      },
    );
  }

  const { data, error } = await admin
    .from('club_notes')
    .select('id, club_name, title, content, author, created_at, author_name')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('先生用部活ノート取得APIでエラー:', error.message);
    return NextResponse.json(
      { success: false, message: '部活・委員会ノートを読み込めませんでした。' },
      { status: 500, headers: noStore },
    );
  }

  return NextResponse.json(
    { success: true, notes: data ?? [] },
    { headers: noStore },
  );
}
