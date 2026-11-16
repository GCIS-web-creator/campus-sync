import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  clearAdminSessionCookie,
  createAdminSessionToken,
  serializeAdminSessionCookie,
  verifyAdminPassword,
  verifyAdminSessionRequest,
} from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type LoginBody = {
  method?: unknown;
  password?: unknown;
  date?: unknown;
  code?: unknown;
};

type AttemptState = {
  failedAttempts: number;
  lockedUntil: string | null;
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function getJstDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return part('year') + part('month') + part('day');
}

function verifyDailyCode(date: unknown, code: unknown): boolean {
  const configuredCode = process.env.CAMPUS_SYNC_ADMIN_DAILY_CODE || '';
  if (!/^\d{6}$/.test(configuredCode)) return false;
  if (typeof date !== 'string' || !/^\d{8}$/.test(date) || date !== getJstDate()) return false;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(configuredCode, 'utf8');
  const received = Buffer.from(code, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function getIpHash(request: Request): string | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const fingerprintSecret = process.env.ADMIN_AUTH_AUDIT_SECRET || serviceKey;
  if (!fingerprintSecret) return null;

  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = realIp || forwardedIp || 'unknown';
  return createHmac('sha256', fingerprintSecret).update(ip).digest('hex');
}

async function writeAudit(
  admin: ReturnType<typeof createClient>,
  method: string,
  outcome: string,
  reason: string,
  ipHash: string,
  userAgent: string,
): Promise<boolean> {
  const { error } = await admin.from('admin_auth_audit_logs').insert({
    method,
    outcome,
    reason,
    ip_hash: ipHash,
    user_agent: userAgent.slice(0, 500),
  });
  if (error) {
    console.error('Admin authentication audit write failed:', error.message);
    return false;
  }
  return true;
}

async function recordAttempt(
  admin: ReturnType<typeof createClient>,
  ipHash: string,
  succeeded: boolean,
): Promise<AttemptState | null> {
  const { data, error } = await admin.rpc('record_admin_login_attempt', {
    p_ip_hash: ipHash,
    p_succeeded: succeeded,
    p_max_failures: MAX_FAILED_ATTEMPTS,
    p_lock_minutes: LOCK_MINUTES,
  });
  if (error) {
    console.error('Admin authentication lockout update failed:', error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const value = row as { failed_attempts?: unknown; locked_until?: unknown };
  return {
    failedAttempts: Number(value.failed_attempts || 0),
    lockedUntil: typeof value.locked_until === 'string' ? value.locked_until : null,
  };
}

function lockedResponse(lockedUntil: string) {
  const retrySeconds = Math.max(1, Math.ceil((Date.parse(lockedUntil) - Date.now()) / 1000));
  return NextResponse.json(
    { success: false, message: 'ログイン試行回数の上限に達しました。15分後に再試行してください。' },
    { status: 429, headers: { ...noStore, 'Retry-After': String(retrySeconds) } },
  );
}

export async function GET(request: Request) {
  return NextResponse.json(
    { authenticated: verifyAdminSessionRequest(request) },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログイン要求です。' }, { status: 403, headers: noStore });
  }

  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) {
    return NextResponse.json(
      { success: false, message: 'Adminパスワードのサーバー設定がありません。管理者に連絡してください。' },
      { status: 503, headers: noStore },
    );
  }

  const admin = getAdminClient();
  const ipHash = getIpHash(request);
  if (!admin || !ipHash) {
    return NextResponse.json(
      { success: false, message: '認証記録のサーバー設定が不足しています。' },
      { status: 503, headers: noStore },
    );
  }

  const userAgent = request.headers.get('user-agent') || '';
  const body = await request.json().catch(() => null) as LoginBody | null;
  const method = body?.method === 'date_code' ? 'date_code' : 'password';

  const { data: currentAttempt, error: readError } = await admin
    .from('admin_login_attempts')
    .select('failed_attempts, locked_until')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (readError) {
    console.error('Admin authentication lockout lookup failed:', readError.message);
    return NextResponse.json(
      { success: false, message: '認証状態を確認できません。時間をおいて再試行してください。' },
      { status: 503, headers: noStore },
    );
  }

  if (typeof currentAttempt?.locked_until === 'string' && Date.parse(currentAttempt.locked_until) > Date.now()) {
    const audited = await writeAudit(admin, method, 'locked', 'lock_active', ipHash, userAgent);
    if (!audited) {
      return NextResponse.json(
        { success: false, message: '認証履歴を保存できません。管理者に連絡してください。' },
        { status: 503, headers: noStore },
      );
    }
    return lockedResponse(currentAttempt.locked_until);
  }

  let validCredentials = false;
  let failureReason = 'invalid_credentials';

  if (method === 'password') {
    validCredentials = verifyAdminPassword(body?.password);
    failureReason = 'password_mismatch';
  } else {
    const configuredCode = process.env.CAMPUS_SYNC_ADMIN_DAILY_CODE || '';
    if (!/^\d{6}$/.test(configuredCode)) {
      const audited = await writeAudit(admin, method, 'error', 'daily_code_not_configured', ipHash, userAgent);
      return NextResponse.json(
        {
          success: false,
          message: audited
            ? '日付＋確認コード方式がまだ設定されていません。管理者に連絡してください。'
            : '認証履歴を保存できません。管理者に連絡してください。',
        },
        { status: 503, headers: noStore },
      );
    }
    validCredentials = verifyDailyCode(body?.date, body?.code);
    failureReason = 'date_or_confirmation_code_mismatch';
  }

  if (!validCredentials) {
    const state = await recordAttempt(admin, ipHash, false);
    if (!state) {
      return NextResponse.json(
        { success: false, message: 'ログイン試行を記録できません。時間をおいて再試行してください。' },
        { status: 503, headers: noStore },
      );
    }

    const outcome = state.lockedUntil && Date.parse(state.lockedUntil) > Date.now() ? 'locked' : 'failure';
    const audited = await writeAudit(admin, method, outcome, failureReason, ipHash, userAgent);
    if (!audited) {
      return NextResponse.json(
        { success: false, message: '認証履歴を保存できません。管理者に連絡してください。' },
        { status: 503, headers: noStore },
      );
    }

    if (outcome === 'locked' && state.lockedUntil) return lockedResponse(state.lockedUntil);
    return NextResponse.json(
      { success: false, message: '入力内容が正しくありません。日付・確認コードまたはパスワードを確認してください。' },
      { status: 401, headers: noStore },
    );
  }

  const session = createAdminSessionToken();
  if (!session) {
    return NextResponse.json(
      { success: false, message: '管理者セッションを作成できませんでした。' },
      { status: 503, headers: noStore },
    );
  }

  const state = await recordAttempt(admin, ipHash, true);
  if (!state) {
    return NextResponse.json(
      { success: false, message: 'ログイン状態を更新できません。時間をおいて再試行してください。' },
      { status: 503, headers: noStore },
    );
  }

  const audited = await writeAudit(admin, method, 'success', 'credentials_accepted', ipHash, userAgent);
  if (!audited) {
    return NextResponse.json(
      { success: false, message: '認証履歴を保存できません。管理者に連絡してください。' },
      { status: 503, headers: noStore },
    );
  }

  return NextResponse.json(
    { success: true, expiresAt: new Date(session.expiresAt * 1000).toISOString() },
    { headers: { ...noStore, 'Set-Cookie': serializeAdminSessionCookie(session.token) } },
  );
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログアウト要求です。' }, { status: 403, headers: noStore });
  }
  return NextResponse.json(
    { success: true },
    { headers: { ...noStore, 'Set-Cookie': clearAdminSessionCookie() } },
  );
}
