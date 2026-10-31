import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuthContext = { user: User; admin: SupabaseClient };

function fail(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
}

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function matchesSecret(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

async function authorize(request: Request): Promise<AuthContext | NextResponse> {
  const allowed = (process.env.CAMPUS_SYNC_HIADMIN_EMAILS || '').split(/[;,]/).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return fail('CAMPUS_SYNC_HIADMIN_EMAILS が未設定です。', 503);

  const gate2 = process.env.CAMPUS_SYNC_HIADMIN_PASSWORD_2 || '';
  const gate3 = process.env.CAMPUS_SYNC_HIADMIN_PASSWORD_3 || '';
  if (gate2.length < 16 || gate3.length < 16 || gate2 === gate3) {
    return fail('CAMPUS_SYNC_HIADMIN_PASSWORD_2 と CAMPUS_SYNC_HIADMIN_PASSWORD_3 に、異なる16文字以上の秘密文字列を設定してください。', 503);
  }

  const authClient = publicClient();
  const admin = serviceClient();
  if (!authClient || !admin) return fail('Supabaseのサーバー環境変数が不足しています。', 503);
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return fail('CampusSyncにログインしてください。', 401);
  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data.user) return fail('ログインセッションを確認できません。再度ログインしてください。', 401);
  const email = (data.user.email || '').trim().toLowerCase();
  if (!email || !allowed.includes(email)) return fail('このアカウントは最高管理者として許可されていません。', 403);

  const { data: attempts, error: attemptsError } = await admin.from('hiadmin_gate_attempts')
    .select('failed_attempts,locked_until').eq('user_id', data.user.id).maybeSingle();
  if (attemptsError) return fail('認証ロック状態を確認できません。', 503);
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > Date.now()) {
    return fail('追加パスワードの失敗回数が上限に達しました。15分後に再試行してください。', 423);
  }

  const provided2 = request.headers.get('x-hiadmin-password-2') || '';
  const provided3 = request.headers.get('x-hiadmin-password-3') || '';
  if (!provided2 || !provided3) return fail('第2・第3パスワードを入力してください。', 428);

  const valid2 = matchesSecret(provided2, gate2);
  const valid3 = matchesSecret(provided3, gate3);
  const valid = valid2 && valid3;
  if (!valid) {
    const failed = (attempts?.failed_attempts || 0) + 1;
    const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    const { error: saveError } = await admin.from('hiadmin_gate_attempts').upsert({
      user_id: data.user.id, failed_attempts: failed, locked_until: lockedUntil, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (saveError) return fail('認証失敗回数を記録できません。', 503);
    if (lockedUntil) return fail('追加パスワードが5回連続で一致しなかったため、15分間ロックしました。', 423);
    return fail('第2・第3パスワードの組み合わせが一致しません。', 409);
  }

  const { error: resetError } = await admin.from('hiadmin_gate_attempts').upsert({
    user_id: data.user.id, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (resetError) return fail('認証状態を更新できません。', 503);
  return { user: data.user, admin };
}

async function countRows(admin: SupabaseClient, table: string, column?: string, value?: string): Promise<number> {
  if (column && !value) return 0;
  let query = admin.from(table).select('*', { count: 'exact', head: true });
  if (column && value) query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error('登録データ件数の取得に失敗しました。');
  return count || 0;
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const view = params.get('view') || 'overview';

  try {
    if (view === 'overview') {
      const [profiles, todos, assignments, classMessages, schoolMessages, lostItems] = await Promise.all([
        countRows(auth.admin, 'profiles'), countRows(auth.admin, 'todos'), countRows(auth.admin, 'assignments'),
        countRows(auth.admin, 'class_chat_messages'), countRows(auth.admin, 'school_chat_messages'), countRows(auth.admin, 'lost_and_found'),
      ]);
      return NextResponse.json({ summary: { profiles, todos, assignments, classMessages, schoolMessages, lostItems } }, {
        headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
      });
    }

    if (view === 'users') {
      const page = Math.min(200, Math.max(1, Number(params.get('page')) || 1));
      const queryText = (params.get('q') || '').trim().slice(0, 80);
      const size = 50;
      let users: Array<{ id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null; email_confirmed_at: string | null; profile: Record<string, unknown> | null }> = [];

      if (queryText) {
        const safe = queryText.replace(/[%,_()\\]/g, ' ').trim().replace(/\s+/g, ' ');
        if (!safe) return NextResponse.json({ users: [], hasMore: false });
        const start = (page - 1) * size;
        const { data: rows, error } = await auth.admin.from('profiles')
          .select('auth_user_id,student_id,student_name,user_class,setup_completed_at,email,created_at')
          .or('student_id.ilike.%' + safe + '%,student_name.ilike.%' + safe + '%,email.ilike.%' + safe + '%')
          .order('created_at', { ascending: false })
          .range(start, start + size);
        if (error) throw new Error('ユーザー検索に失敗しました。');
        const matching = (rows || []).filter((row) => row.auth_user_id);
        users = await Promise.all(matching.slice(0, size).map(async (row) => {
          const { data: result } = await auth.admin.auth.admin.getUserById(row.auth_user_id);
          return {
            id: row.auth_user_id as string,
            email: result.user?.email || row.email || null,
            created_at: result.user?.created_at || row.created_at || null,
            last_sign_in_at: result.user?.last_sign_in_at || null,
            email_confirmed_at: result.user?.email_confirmed_at || null,
            profile: { student_id: row.student_id, student_name: row.student_name, user_class: row.user_class, setup_completed_at: row.setup_completed_at },
          };
        }));
        return NextResponse.json({ users, hasMore: (rows || []).length > size }, {
          headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
        });
      }

      const { data, error } = await auth.admin.auth.admin.listUsers({ page, perPage: size });
      if (error) throw new Error('認証アカウント一覧を取得できません。');
      const accounts = data.users || [];
      const ids = accounts.map((item) => item.id);
      let profiles: Array<{ auth_user_id: string; student_id: string; student_name: string; user_class: string; setup_completed_at: string | null }> = [];
      if (ids.length) {
        const { data: rows, error: profileError } = await auth.admin.from('profiles')
          .select('auth_user_id,student_id,student_name,user_class,setup_completed_at').in('auth_user_id', ids);
        if (profileError) throw new Error('プロフィール一覧を取得できません。');
        profiles = rows || [];
      }
      const byId = new Map(profiles.map((item) => [item.auth_user_id, item]));
      users = accounts.map((item) => {
        const profile = byId.get(item.id);
        return {
          id: item.id,
          email: item.email || null,
          created_at: item.created_at || null,
          last_sign_in_at: item.last_sign_in_at || null,
          email_confirmed_at: item.email_confirmed_at || null,
          profile: profile ? { student_id: profile.student_id, student_name: profile.student_name, user_class: profile.user_class, setup_completed_at: profile.setup_completed_at } : null,
        };
      });
      return NextResponse.json({ users, hasMore: accounts.length === size }, {
        headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' },
      });
    }

    if (view === 'user') {
      const userId = params.get('userId') || '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return fail('ユーザーIDが正しくありません。', 400);
      const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
        auth.admin.auth.admin.getUserById(userId),
        auth.admin.from('profiles').select('student_id,student_name,user_class,setup_completed_at,created_at').eq('auth_user_id', userId).maybeSingle(),
      ]);
      if (accountError || !account.user) return fail('ユーザーアカウントが見つかりません。', 404);
      if (profileError) throw new Error('プロフィールを取得できません。');
      const studentId = profile?.student_id || '';
      const [todos, assignmentCompletions, contributionHistory, classMessages, schoolMessages, lostItems] = await Promise.all([
        countRows(auth.admin, 'todos', 'student_id', studentId),
        countRows(auth.admin, 'assignment_completions', 'student_id', studentId),
        countRows(auth.admin, 'contribution_history', 'student_id', studentId),
        countRows(auth.admin, 'class_chat_messages', 'user_id', userId),
        countRows(auth.admin, 'school_chat_messages', 'user_id', userId),
        countRows(auth.admin, 'lost_and_found', 'student_id', studentId),
      ]);
      const audit = await auth.admin.from('hiadmin_audit_logs').insert({
        actor_user_id: auth.user.id, actor_email: auth.user.email || '', action: 'user.profile_summary_viewed',
        target_user_id: userId, details: { viewed: ['profile', 'account_status', 'usage_counts'] },
      });
      if (audit.error) throw new Error('監査ログを記録できなかったため、詳細表示を中止しました。');
      return NextResponse.json({
        detail: {
          user: { id: account.user.id, email: account.user.email || null, created_at: account.user.created_at || null, last_sign_in_at: account.user.last_sign_in_at || null, email_confirmed_at: account.user.email_confirmed_at || null },
          profile: profile || null,
          counts: { todos, assignmentCompletions, contributionHistory, classMessages, schoolMessages, lostItems },
        },
      }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }

    if (view === 'audit') {
      const { data, error } = await auth.admin.from('hiadmin_audit_logs').select('id,actor_email,action,target_user_id,created_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error('監査ログを取得できません。');
      return NextResponse.json({ logs: data || [] }, { headers: { 'Cache-Control': 'no-store, private', 'Vary': 'Authorization' } });
    }
    return fail('指定された表示形式は利用できません。', 400);
  } catch (error) {
    console.error('HiAdmin request failed:', error instanceof Error ? error.message : 'unknown error');
    return fail(error instanceof Error ? error.message : '最高管理者データを取得できませんでした。', 500);
  }
}
