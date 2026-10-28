import { createClient } from '@supabase/supabase-js';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { broadcastClubNoteToLine } from '@/lib/club-note-line';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError('管理用のサーバー環境変数を設定してください。', 503);
  }
  if (!isAuthorized(request)) return jsonError('管理用パスワードが正しくありません。', 401);
  const admin = getAdminClient();
  if (!admin) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const [notesResult, permissionsResult, codesResult] = await Promise.all([
    admin.from('club_notes')
      .select('id,club_name,title,content,author,author_name,author_user_id,created_at,line_delivery_status,line_delivery_error,line_sent_at,line_request_id')
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('club_post_permissions')
      .select('user_id,student_id,can_post,display_name,granted_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(500),
    admin.from('club_post_codes')
      .select('id,allowed_student_id,created_at,expires_at,used_at,redeemed_by,created_by_label')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (notesResult.error || permissionsResult.error || codesResult.error) {
    return jsonError('部活・委員会投稿データを取得できません。supabase/club-posting-permissions.sql の実行状態を確認してください。', 500);
  }

  const permissionRows = permissionsResult.data || [];
  const studentIds = [...new Set(permissionRows.map(row => String(row.student_id)))];
  const profilesResult = studentIds.length
    ? await admin.from('profiles').select('student_id,student_name,user_class').in('student_id', studentIds)
    : { data: [], error: null };
  if (profilesResult.error) return jsonError('投稿許可ユーザーのプロフィールを取得できません。', 500);
  const profileByStudentId = new Map((profilesResult.data || []).map(row => [row.student_id, row] as const));
  const permissions = permissionRows.map(row => {
    const profile = profileByStudentId.get(row.student_id);
    return {
      ...row,
      student_name: profile?.student_name || '',
      user_class: profile?.user_class || '',
    };
  });

  return NextResponse.json({
    notes: notesResult.data || [],
    permissions,
    codes: (codesResult.data || []).map(row => ({
      ...row,
      status: row.used_at ? 'used' : new Date(row.expires_at).getTime() <= Date.now() ? 'expired' : 'active',
    })),
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonError('管理用のサーバー環境変数を設定してください。', 503);
  }
  if (!isAuthorized(request)) return jsonError('管理用パスワードが正しくありません。', 401);
  const admin = getAdminClient();
  if (!admin) return jsonError('Supabaseのサーバー設定が不足しています。', 503);

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.action !== 'string') return jsonError('操作内容が不正です。', 400);
  const action = payload.action;

  if (action === 'post') {
    const clubName = typeof payload.clubName === 'string' ? payload.clubName.trim() : '';
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const content = typeof payload.content === 'string' ? payload.content.trim() : '';
    const authorName = typeof payload.authorName === 'string' ? payload.authorName.trim() : '';
    if (!clubName || clubName.length > 80 || !title || title.length > 160 || !content || content.length > 3000 || !authorName || authorName.length > 50) {
      return jsonError('部活・委員会名、件名、本文、発信者名を入力してください。文字数の上限も確認してください。', 400);
    }
    if (authorName.includes('@') || /^[0-9]{6}(?:\s*より)?$/.test(authorName)) {
      return jsonError('発信者名にメールアドレスや学籍番号は使えません。表示用の氏名・担当名を入力してください。', 400);
    }
    const { data, error } = await admin.from('club_notes').insert({
      club_name: clubName,
      title,
      content,
      author: authorName,
      author_name: authorName,
      author_user_id: null,
      created_at: new Date().toISOString(),
    }).select('id,club_name,title,content,author,author_name,author_user_id,created_at').single();
    if (error) return jsonError('投稿を保存できませんでした。SQL適用状態を確認してください。', 500);
    const lineDelivery = await broadcastClubNoteToLine(admin, data.id);
    return NextResponse.json({
      note: data,
      lineDelivery,
      message: lineDelivery.message,
    }, { status: 201, headers: { 'Cache-Control': 'no-store, private' } });
  }

  if (action === 'grant' || action === 'revoke') {
    const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
    if (!/^\d{6}$/.test(studentId)) return jsonError('6桁の学籍番号を入力してください。', 400);
    if (action === 'grant' && displayName.length > 50) return jsonError('表示名は50文字以内にしてください。', 400);
    if (action === 'grant' && (displayName.includes('@') || /^[0-9]{6}(?:\s*より)?$/.test(displayName))) {
      return jsonError('既定表示名にメールアドレスや学籍番号は使えません。', 400);
    }
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('student_id,student_name,auth_user_id,setup_completed_at')
      .eq('student_id', studentId)
      .maybeSingle();
    if (profileError) return jsonError('プロフィールを確認できませんでした。', 500);
    if (!profile?.auth_user_id || !profile.setup_completed_at) {
      return jsonError('対象の生徒は初回プロフィール設定が未完了です。先に学校メールでログインして設定を完了してもらってください。', 409);
    }
    const { error } = await admin.from('club_post_permissions').upsert({
      user_id: profile.auth_user_id,
      student_id: studentId,
      can_post: action === 'grant',
      display_name: displayName,
      updated_at: new Date().toISOString(),
      ...(action === 'grant' ? { granted_at: new Date().toISOString() } : {}),
    }, { onConflict: 'user_id' });
    if (error) return jsonError('投稿権限を保存できませんでした。SQL適用状態を確認してください。', 500);
    if (action === 'revoke') {
      // Revoking direct permission also invalidates unredeemed one-time codes.
      const { error: codeError } = await admin.from('club_post_codes')
        .update({ expires_at: new Date().toISOString() })
        .eq('allowed_student_id', studentId)
        .is('used_at', null);
      if (codeError) return jsonError('投稿は禁止しましたが、未使用コードを無効化できませんでした。SQL適用状態を確認してください。', 500);
    }
    return NextResponse.json({
      success: true,
      message: action === 'grant' ? '投稿を許可しました。' : '投稿を禁止し、未使用の一回限りコードも無効化しました。',
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  }

  if (action === 'issue-code') {
    const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
    if (!/^\d{6}$/.test(studentId)) return jsonError('コードを渡す対象の6桁の学籍番号を入力してください。', 400);
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('student_id,auth_user_id,setup_completed_at')
      .eq('student_id', studentId)
      .maybeSingle();
    if (profileError) return jsonError('プロフィールを確認できませんでした。', 500);
    if (!profile?.auth_user_id || !profile.setup_completed_at) {
      return jsonError('対象の生徒は初回プロフィール設定が未完了です。', 409);
    }
    const pepper = process.env.CLUB_POST_CODE_PEPPER || '';
    if (pepper.length < 32) {
      return jsonError('CLUB_POST_CODE_PEPPER に32文字以上のランダムな秘密値をVercel環境変数として設定してください。', 503);
    }
    const code = String(randomInt(10_000_000, 100_000_000));
    const codeHash = createHmac('sha256', pepper).update(code, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await admin.from('club_post_codes').insert({
      code_hash: codeHash,
      allowed_student_id: studentId,
      expires_at: expiresAt,
      created_by_label: 'Admin',
    });
    if (error) return jsonError('一回限りコードを発行できませんでした。SQL適用状態を確認してください。', 500);
    // Raw code is returned only once and is never stored in the database.
    return NextResponse.json({
      code,
      studentId,
      expiresAt,
      message: 'この8桁コードは対象の生徒専用で、24時間後に期限切れになります。使用後は再利用できません。',
    }, { status: 201, headers: { 'Cache-Control': 'no-store, private' } });
  }

  if (action === 'retry-line') {
    const id = typeof payload.id === 'string' || typeof payload.id === 'number' ? payload.id : null;
    if (id === null || String(id).length > 80) return jsonError('投稿IDが不正です。', 400);
    const lineDelivery = await broadcastClubNoteToLine(admin, id);
    return NextResponse.json({
      success: lineDelivery.status === 'sent' || lineDelivery.status === 'already_sent',
      lineDelivery,
      message: lineDelivery.message,
    }, {
      status: lineDelivery.status === 'failed' ? 502 : 200,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  if (action === 'delete-post') {
    const id = typeof payload.id === 'string' || typeof payload.id === 'number' ? payload.id : null;
    if (id === null || String(id).length > 80) return jsonError('削除する投稿IDが不正です。', 400);
    const { data, error } = await admin.from('club_notes').delete().eq('id', id).select('id').maybeSingle();
    if (error) return jsonError('投稿を削除できませんでした。', 500);
    if (!data) return jsonError('投稿が見つかりません。', 404);
    return NextResponse.json({ success: true });
  }

  return jsonError('未対応の操作です。', 400);
}
