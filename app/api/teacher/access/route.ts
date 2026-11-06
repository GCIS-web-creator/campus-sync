import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getTeacherAccessAdmin, getTeacherSessionToken, getTokyoDateKey, hashTeacherSecret, isSameOriginRequest, normalizeTeacherAccessCode, serializeTeacherSessionCookie, clearTeacherSessionCookie, TEACHER_SESSION_TTL_SECONDS } from '@/lib/teacher-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };

async function readSession(request: Request) {
  const token = getTeacherSessionToken(request);
  if (!token) return null;
  const admin = getTeacherAccessAdmin();
  if (!admin) return null;
  const { data: session } = await admin.from('teacher_access_sessions')
    .select('id,access_code_id,expires_at')
    .eq('session_token_hash', hashTeacherSecret(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!session) return null;

  const { data: code } = await admin.from('teacher_access_codes')
    .select('id,display_name,starts_on,ends_on,is_active')
    .eq('id', session.access_code_id)
    .maybeSingle();
  const today = getTokyoDateKey();
  if (!code || !code.is_active || today < code.starts_on || today > code.ends_on) return null;

  await admin.from('teacher_access_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
  return { name: code.display_name, endsOn: code.ends_on, expiresAt: session.expires_at };
}

export async function GET(request: Request) {
  const session = await readSession(request);
  if (!session) return NextResponse.json({ success: false, authenticated: false }, { status: 401, headers: { ...noStore, 'Set-Cookie': clearTeacherSessionCookie() } });
  return NextResponse.json({ success: true, authenticated: true, teacher: session }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, message: '不正なログイン要求です。' }, { status: 403, headers: noStore });
  const admin = getTeacherAccessAdmin();
  if (!admin) return NextResponse.json({ success: false, message: '認証サーバーの設定が不足しています。' }, { status: 503, headers: noStore });
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const normalized = normalizeTeacherAccessCode(body?.code);
  if (!normalized) return NextResponse.json({ success: false, message: 'コードが正しくありません。' }, { status: 401, headers: noStore });

  const { data: code, error } = await admin.from('teacher_access_codes')
    .select('id,display_name,starts_on,ends_on,is_active,use_count')
    .eq('code_hash', hashTeacherSecret(normalized))
    .maybeSingle();
  const today = getTokyoDateKey();
  if (error || !code || !code.is_active || today < code.starts_on || today > code.ends_on) {
    return NextResponse.json({ success: false, message: 'コードが無効か、利用期間外です。管理担当者に確認してください。' }, { status: 401, headers: noStore });
  }

  const sessionToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TEACHER_SESSION_TTL_SECONDS * 1000).toISOString();
  const { error: sessionError } = await admin.from('teacher_access_sessions').insert({
    access_code_id: code.id,
    session_token_hash: hashTeacherSecret(sessionToken),
    expires_at: expiresAt,
  });
  if (sessionError) {
    console.error('先生用セッションの発行に失敗:', sessionError.message);
    return NextResponse.json({ success: false, message: 'ログイン処理に失敗しました。' }, { status: 500, headers: noStore });
  }
  await admin.from('teacher_access_codes').update({ last_used_at: new Date().toISOString() }).eq('id', code.id);
  await admin.from('teacher_access_codes').update({ use_count: (Number(code.use_count) || 0) + 1 }).eq('id', code.id);

  return NextResponse.json(
    { success: true, teacher: { name: code.display_name, endsOn: code.ends_on, expiresAt } },
    { headers: { ...noStore, 'Set-Cookie': serializeTeacherSessionCookie(sessionToken) } },
  );
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ success: false, message: '不正なログアウト要求です。' }, { status: 403, headers: noStore });
  const admin = getTeacherAccessAdmin();
  const token = getTeacherSessionToken(request);
  if (admin && token) {
    await admin.from('teacher_access_sessions').delete().eq('session_token_hash', hashTeacherSecret(token));
  }
  return NextResponse.json({ success: true }, { headers: { ...noStore, 'Set-Cookie': clearTeacherSessionCookie() } });
}
