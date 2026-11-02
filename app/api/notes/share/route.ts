import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorJson(message: string, status: number) {
  return NextResponse.json({ message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function getContext(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return { response: errorJson('学校アカウントでログインしてください。', 401) } as const;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !publishable || !service) return { response: errorJson('メモ共有APIのサーバー設定が不足しています。', 503) } as const;

  const auth = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return { response: errorJson('ログインの有効期限が切れています。', 401) } as const;

  const email = String(data.user.email || '').trim().toLowerCase();
  const match = /^([0-9]{6})@tokyo\.soka\.ed\.jp$/.exec(email);
  if (!match) return { response: errorJson('学校メールでログインしてください。', 403) } as const;

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('student_id,student_name,auth_user_id,email')
    .eq('student_id', match[1])
    .eq('auth_user_id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) return { response: errorJson('プロフィールを確認できませんでした。', 403) } as const;

  return { user: data.user, studentId: match[1], profile, admin } as const;
}

export async function POST(request: Request) {
  const context = await getContext(request);
  if ('response' in context) return context.response;

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return errorJson('共有リクエストを読み取れません。', 400);
  const action = typeof payload.action === 'string' ? payload.action : '';
  const noteId = typeof payload.noteId === 'string' ? payload.noteId : '';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(noteId)) return errorJson('メモIDが正しくありません。', 400);
  if (!['list', 'invite', 'remove'].includes(action)) return errorJson('対応していない操作です。', 400);

  const { data: note, error: noteError } = await context.admin.from('campus_notes')
    .select('id,owner_id').eq('id', noteId).maybeSingle();
  if (noteError || !note) return errorJson('メモが見つかりません。', 404);
  if (note.owner_id !== context.user.id) return errorJson('共有設定を変更できるのはメモの所有者だけです。', 403);

  if (action === 'list') {
    const { data: collaborators, error } = await context.admin.from('campus_note_collaborators')
      .select('user_id,role').eq('note_id', noteId).order('created_at', { ascending: true });
    if (error) return errorJson('共有メンバーを取得できませんでした。', 500);
    const ids = (collaborators || []).map(row => row.user_id);
    let profiles: Array<{ auth_user_id: string; student_id: string; student_name: string }> = [];
    if (ids.length) {
      const { data: profileRows, error: profileRowsError } = await context.admin.from('profiles')
        .select('auth_user_id,student_id,student_name').in('auth_user_id', ids);
      if (profileRowsError) return errorJson('共有メンバーのプロフィールを取得できませんでした。', 500);
      profiles = (profileRows || []) as typeof profiles;
    }
    const byUser = new Map(profiles.map(profile => [profile.auth_user_id, profile]));
    const shares = (collaborators || []).map(row => {
      const profile = byUser.get(row.user_id);
      return { user_id: row.user_id, student_id: profile?.student_id || '', student_name: profile?.student_name || '生徒', role: row.role };
    });
    return NextResponse.json({ shares }, { headers: { 'Cache-Control': 'no-store, private' } });
  }

  if (action === 'invite') {
    const studentId = typeof payload.studentId === 'string' ? payload.studentId.trim() : '';
    const role = payload.role === 'viewer' ? 'viewer' : payload.role === 'editor' ? 'editor' : '';
    if (!/^[0-9]{6}$/.test(studentId) || !role) return errorJson('6桁の学籍番号と権限を確認してください。', 400);
    if (studentId === context.studentId) return errorJson('自分自身は共有相手に追加できません。', 400);

    const { data: target, error: targetError } = await context.admin.from('profiles')
      .select('student_id,student_name,auth_user_id,email').eq('student_id', studentId).maybeSingle();
    if (targetError) return errorJson('共有相手を検索できませんでした。', 500);
    if (!target?.auth_user_id || String(target.email || '').trim().toLowerCase() !== studentId + '@tokyo.soka.ed.jp') {
      return errorJson('その学籍番号の登録済み学校アカウントが見つかりません。', 404);
    }

    const { error: inviteError } = await context.admin.from('campus_note_collaborators').upsert({
      note_id: noteId, user_id: target.auth_user_id, role, invited_by: context.user.id,
    }, { onConflict: 'note_id,user_id' });
    if (inviteError) return errorJson('共有相手を追加できませんでした。', 500);
    await context.admin.from('campus_notes').update({ visibility: 'shared' }).eq('id', noteId);
    return NextResponse.json({
      share: { user_id: target.auth_user_id, student_id: target.student_id, student_name: target.student_name || '生徒', role },
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  }

  const targetUserId = typeof payload.userId === 'string' ? payload.userId : '';
  if (!uuid.test(targetUserId)) return errorJson('解除する共有メンバーが正しくありません。', 400);
  const { error: removeError } = await context.admin.from('campus_note_collaborators')
    .delete().eq('note_id', noteId).eq('user_id', targetUserId);
  if (removeError) return errorJson('共有を解除できませんでした。', 500);

  const { count, error: countError } = await context.admin.from('campus_note_collaborators')
    .select('id', { count: 'exact', head: true }).eq('note_id', noteId);
  if (!countError && (count || 0) === 0) {
    await context.admin.from('campus_notes').update({ visibility: 'private' }).eq('id', noteId);
  }
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, private' } });
}
