import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// サーバー専用。決して NEXT_PUBLIC_ を付けたり、クライアントへ返したりしない。
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;

type HandoffBody = { action?: string; id?: string; secret?: string };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('サーバー環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません。');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getBearerUser(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) throw new Error('SupabaseのURLまたは公開キーが設定されていません。');
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await userClient.auth.getUser(match[1]);
  if (error || !data.user || !SCHOOL_EMAIL.test(data.user.email || '')) return null;
  return { user: data.user, admin: getAdminClient() };
}

const hashSecret = (secret: string) => createHash('sha256').update(secret, 'utf8').digest('hex');
function sameSecret(storedHash: string, suppliedHash: string) {
  const left = Buffer.from(storedHash, 'hex');
  const right = Buffer.from(suppliedHash, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function loadHandoff(admin: ReturnType<typeof getAdminClient>, id: string, secret: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || secret.length < 32 || secret.length > 100) return { error: 'QRコードが正しくありません。' } as const;
  const { data, error } = await admin.from('student_login_handoffs')
    .select('id, user_id, email, secret_hash, status, expires_at, login_token_hash')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || !sameSecret(data.secret_hash, hashSecret(secret))) return { error: 'QRコードが無効です。' } as const;
  if (new Date(data.expires_at).getTime() <= Date.now() && data.status !== 'used') return { data: { ...data, status: 'expired' } } as const;
  return { data } as const;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandoffBody;
    const action = body.action;

    if (action === 'create') {
      const owner = await getBearerUser(request);
      if (!owner) return json({ success: false, message: 'ログインが必要です。' }, 401);
      const email = String(owner.user.email || '').toLowerCase();
      const secret = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 90_000).toISOString();
      const id = randomUUID();
      const { error } = await owner.admin.from('student_login_handoffs').insert({
        id, user_id: owner.user.id, email, secret_hash: hashSecret(secret), status: 'waiting', expires_at: expiresAt,
      });
      if (error) throw error;
      return json({ success: true, id, secret, expires_at: expiresAt });
    }

    if (['request', 'poll', 'redeem'].includes(String(action))) {
      const id = String(body.id || '');
      const secret = String(body.secret || '');
      const admin = getAdminClient();
      const loaded = await loadHandoff(admin, id, secret);
      if ('error' in loaded) return json({ success: false, message: loaded.error }, 400);
      const row = loaded.data;
      if (row.status === 'expired') return json({ success: true, status: 'expired' });

      if (action === 'request') {
        if (row.status === 'waiting') {
          const { data, error } = await admin.from('student_login_handoffs')
            .update({ status: 'requested', requested_at: new Date().toISOString() })
            .eq('id', id).eq('status', 'waiting').gt('expires_at', new Date().toISOString())
            .select('status').maybeSingle();
          if (error) throw error;
          if (!data) return json({ success: false, message: 'QRの有効期限が切れたか、すでに処理されています。' }, 409);
          return json({ success: true, status: data.status });
        }
        if (row.status === 'requested') return json({ success: true, status: 'requested' });
        return json({ success: true, status: row.status });
      }

      if (action === 'poll') return json({ success: true, status: row.status });

      if (action === 'redeem') {
        if (row.status !== 'approved' || !row.login_token_hash) {
          return json({ success: false, message: '元の端末でログインを許可するまでお待ちください。', status: row.status }, 409);
        }
        // 一度だけ状態をapprovedからusedへ変更してからトークンを返す。
        const { data, error } = await admin.from('student_login_handoffs')
          .update({ status: 'used', used_at: new Date().toISOString() })
          .eq('id', id).eq('status', 'approved').gt('expires_at', new Date().toISOString())
          .select('login_token_hash').maybeSingle();
        if (error) throw error;
        if (!data?.login_token_hash) return json({ success: false, message: 'このログインQRは使用済みか、期限切れです。' }, 409);
        return json({ success: true, token_hash: data.login_token_hash });
      }
    }

    if (['status', 'approve', 'deny'].includes(String(action))) {
      const owner = await getBearerUser(request);
      if (!owner) return json({ success: false, message: '認証が切れました。もう一度ログインしてください。' }, 401);
      const id = String(body.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, message: 'リクエストIDが正しくありません。' }, 400);
      const { data: row, error: loadError } = await owner.admin.from('student_login_handoffs')
        .select('id, user_id, email, status, expires_at').eq('id', id).maybeSingle();
      if (loadError) throw loadError;
      if (!row || row.user_id !== owner.user.id) return json({ success: false, message: 'このログイン要求を操作する権限がありません。' }, 403);
      if (new Date(row.expires_at).getTime() <= Date.now() && row.status !== 'used') return json({ success: true, status: 'expired' });

      if (action === 'status') return json({ success: true, status: row.status });
      if (action === 'deny') {
        const { data, error } = await owner.admin.from('student_login_handoffs')
          .update({ status: 'denied' }).eq('id', id).eq('user_id', owner.user.id).eq('status', 'requested')
          .select('status').maybeSingle();
        if (error) throw error;
        if (!data) return json({ success: false, message: '拒否できませんでした。QRの期限が切れた可能性があります。' }, 409);
        return json({ success: true, status: data.status });
      }

      if (row.status !== 'requested') return json({ success: false, message: '承認待ちのログイン要求がありません。' }, 409);
      const { data: linkData, error: linkError } = await owner.admin.auth.admin.generateLink({ type: 'magiclink', email: row.email });
      if (linkError) throw linkError;
      const tokenHash = linkData.properties?.hashed_token;
      if (!tokenHash) throw new Error('Supabase Authから一時ログイントークンを取得できませんでした。');
      const { data, error } = await owner.admin.from('student_login_handoffs')
        .update({ status: 'approved', approved_at: new Date().toISOString(), login_token_hash: tokenHash })
        .eq('id', id).eq('user_id', owner.user.id).eq('status', 'requested').gt('expires_at', new Date().toISOString())
        .select('status').maybeSingle();
      if (error) throw error;
      if (!data) return json({ success: false, message: 'QRの有効期限が切れました。新しいQRを発行してください。' }, 409);
      return json({ success: true, status: data.status });
    }

    return json({ success: false, message: '未対応の操作です。' }, 400);
  } catch (error) {
    console.error('Student login handoff error:', error);
    const message = error instanceof Error ? error.message : '不明なサーバーエラー';
    return json({ success: false, message }, 500);
  }
}
