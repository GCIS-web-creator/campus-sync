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

async function getAuthenticatedSchoolUser(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return { response: jsonError('学校メールでログインしてください。', 401) } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    return { response: jsonError('投稿APIのサーバー設定が不足しています。', 503) } as const;
  }
  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return { response: jsonError('ログインの有効期限が切れています。再ログインしてください。', 401) } as const;
  const email = String(data.user.email || '').trim().toLowerCase();
  const match = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/.exec(email);
  if (!match) return { response: jsonError('学校メールでログインしてください。', 403) } as const;
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { user: data.user, studentId: match[1], admin } as const;
}

export async function GET(request: Request) {
  const context = await getAuthenticatedSchoolUser(request);
  if ('response' in context) return context.response;
  const { data: profile, error: profileError } = await context.admin.from('profiles')
    .select('student_id,student_name,setup_completed_at')
    .eq('student_id', context.studentId)
    .eq('auth_user_id', context.user.id)
    .maybeSingle();
  if (profileError) return jsonError('プロフィールを読み込めませんでした。', 500);
  if (!profile?.setup_completed_at) return jsonError('初回プロフィール設定が完了していません。', 403);

  const { data: permission, error } = await context.admin.from('club_post_permissions')
    .select('can_post,display_name')
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (error) return jsonError('投稿設定を読み込めませんでした。SupabaseのSQL適用状態を確認してください。', 500);

  const { data: notes, error: notesError } = await context.admin.from('club_notes')
    .select('id,club_name,title,content,author_name,author,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (notesError) return jsonError('部活・委員会のタイムラインを取得できません。SupabaseのSQL適用状態を確認してください。', 500);

  return NextResponse.json({
    canPostWithoutCode: permission?.can_post === true,
    defaultDisplayName: String(permission?.display_name || profile.student_name || '').trim(),
    notes: notes || [],
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  const context = await getAuthenticatedSchoolUser(request);
  if ('response' in context) return context.response;
  const { user, studentId, admin } = context;

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

  if (/@/.test(authorName) || /^[0-9]{6}(?:\s*より)?$/.test(authorName)) {
    return jsonError('発信者名にメールアドレスや学籍番号は使えません。表示用の氏名・担当名を入力してください。', 400);
  }
  const codeHash = permissionCode
    ? createHash('sha256').update(permissionCode, 'utf8').digest('hex')
    : null;
  const { data, error } = await admin.rpc('submit_club_note', {
    p_user_id: user.id,
    p_student_id: studentId,
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
