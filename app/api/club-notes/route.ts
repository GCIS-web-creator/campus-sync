import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return jsonError('学校メールでログインしてください。', 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return jsonError('投稿APIのサーバー設定が不足しています。', 503);
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user) return jsonError('ログインの有効期限が切れています。再ログインしてください。', 401);

  const email = String(authData.user.email || '').trim().toLowerCase();
  const match = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/.exec(email);
  if (!match) return jsonError('学校メールでログインしてください。', 403);

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return jsonError('投稿内容を読み取れません。', 400);
  const clubName = typeof payload.clubName === 'string' ? payload.clubName.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const authorName = typeof payload.authorName === 'string' ? payload.authorName.trim() : '';
  const permissionCode = typeof payload.permissionCode === 'string' ? payload.permissionCode.trim() : '';

  if (!clubName || clubName.length > 80 || !title || title.length > 160 ||
      !content || content.length > 3000 || !authorName || authorName.length > 50) {
    return jsonError('部活・委員会名、件名、本文、発信者名を入力してください。文字数の上限も確認してください。', 400);
  }
  if (permissionCode && !/^[0-9]{8}$/.test(permissionCode)) {
    return jsonError('許可コードは8桁の数字で入力してください。', 400);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const codeHash = permissionCode
    ? createHash('sha256').update(permissionCode, 'utf8').digest('hex')
    : null;
  const { data, error } = await admin.rpc('submit_club_note', {
    p_user_id: authData.user.id,
    p_student_id: match[1],
    p_club_name: clubName,
    p_title: title,
    p_content: content,
    p_author_name: authorName,
    p_code_hash: codeHash,
  });

  if (error) {
    const rawMessage = String(error.message || '');
    const safeMessage = /Adminから許可|コードが無効|短時間の連続投稿|プロフィール設定|投稿内容/.test(rawMessage)
      ? rawMessage
      : '投稿できませんでした。Adminからの許可・コード、またはSupabaseの設定を確認してください。';
    return jsonError(safeMessage, /許可|コード|短時間|プロフィール設定|投稿内容/.test(rawMessage) ? 403 : 500);
  }

  return NextResponse.json({ note: data, message: '連絡事項をタイムラインに投稿しました。' }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
