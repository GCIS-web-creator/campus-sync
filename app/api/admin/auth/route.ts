import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type LoginMethod = 'password' | 'date';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function getRequestIp(request: Request): string {
  const value = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || 'unknown';
  return value.trim().slice(0, 128) || 'unknown';
}

function getIpHash(request: Request): string {
  // IP address is stored only as a keyed hash, never in plaintext.
  return createHmac('sha256', process.env.CAMPUS_SYNC_ADMIN_PASSWORD || 'campussync-admin')
    .update('campussync-admin-ip:v1:' + getRequestIp(request))
    .digest('hex');
}

function getTokyoDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function expectedDailyCode(now = new Date()): string | null {
  const secret = process.env.CAMPUS_SYNC_ADMIN_DATE_CODE_SECRET || '';
  if (secret.length < 32) return null;
  const date = getTokyoDateKey(now);
  const digest = createHmac('sha256', secret)
    .update('campussync-admin-date-code:v1:' + date)
    .digest();
  const suffix = String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
  return date + '-' + suffix;
}

function verifyDailyCode(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{8}-\d{6}$/.test(value)) return false;
  const expected = expectedDailyCode();
  if (!expected) return false;
  const received = Buffer.from(value, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

async function writeAudit(
  admin: SupabaseClient,
  request: Request,
  ipHash: string,
  method: LoginMethod | 'session',
  outcome: 'success' | 'failure' | 'blocked' | 'logout',
  reason: string,
): Promise<boolean> {
  const { error } = await admin.from('admin_auth_audit_logs').insert({
    method,
    outcome,
    reason,
    ip_hash: ipHash,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
  });
  if (error) console.error('Admin auth audit write failed:', error.code || 'unknown');
  return !error;
}

export async function GET(request: Request) {
  return NextResponse.json(
    { authenticated: verifyAdminSessionRequest(request) },
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログイン要求です。' }, { status: 403 });
  }

  const configuredPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  if (!configuredPassword) {
    return NextResponse.json(
      { success: false, message: 'CAMPUS_SYNC_ADMIN_PASSWORD がサーバーに設定されていません。' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null) as {
    method?: unknown;
    password?: unknown;
    dateCode?: unknown;
  } | null;
  const method: LoginMethod = body?.method === 'date' ? 'date' : 'password';

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, message: '認証ログ用のSupabaseサーバー設定が不足しています。' },
      { status: 503 },
    );
  }

  const ipHash = getIpHash(request);
  const now = new Date();
  const { data: attempt, error: attemptError } = await admin
    .from('admin_login_attempts')
    .select('failed_attempts, locked_until')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (attemptError) {
    console.error('Admin auth lock lookup failed:', attemptError.code || 'unknown');
    return NextResponse.json({ success: false, message: 'ログイン保護状態を確認できません。' }, { status: 503 });
  }

  const lockedUntil = attempt?.locked_until ? new Date(attempt.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    const logged = await writeAudit(admin, request, ipHash, method, 'blocked', 'temporary_lock_active');
    if (!logged) {
      return NextResponse.json({ success: false, message: '監査ログを保存できません。' }, { status: 503 });
    }
    const remainingMinutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
    return NextResponse.json(
      { success: false, message: `連続失敗によりログインを一時停止中です。約${remainingMinutes}分後に再試行してください。` },
      { status: 423, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (method === 'date' && !expectedDailyCode(now)) {
    const logged = await writeAudit(admin, request, ipHash, method, 'blocked', 'date_code_secret_not_configured');
    if (!logged) {
      return NextResponse.json({ success: false, message: '監査ログを保存できません。' }, { status: 503 });
    }
    return NextResponse.json(
      { success: false, message: '日付コード用の秘密鍵が未設定です。Cloudflareに CAMPUS_SYNC_ADMIN_DATE_CODE_SECRET を登録してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const valid = method === 'date'
    ? verifyDailyCode(body?.dateCode)
    : verifyAdminPassword(body?.password);

  if (!valid) {
    const { data: failureRows, error: failureError } = await admin.rpc('record_admin_login_failure', {
      p_ip_hash: ipHash,
      p_now: now.toISOString(),
    });
    if (failureError) {
      console.error('Admin auth failure counter update failed:', failureError.code || 'unknown');
      return NextResponse.json({ success: false, message: '失敗回数を記録できません。' }, { status: 503 });
    }

    const failure = Array.isArray(failureRows) ? failureRows[0] : failureRows;
    const newlyLockedUntil = failure?.locked_until ? new Date(failure.locked_until) : null;
    const locked = Boolean(newlyLockedUntil && newlyLockedUntil.getTime() > now.getTime());
    const logged = await writeAudit(admin, request, ipHash, method, locked ? 'blocked' : 'failure', 'invalid_credential');
    if (!logged) {
      return NextResponse.json({ success: false, message: '監査ログを保存できません。' }, { status: 503 });
    }

    if (locked) {
      return NextResponse.json(
        { success: false, message: `${MAX_FAILED_ATTEMPTS}回連続で認証に失敗したため、15分間ロックしました。` },
        { status: 423, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { success: false, message: method === 'date' ? '日付コードが正しくありません。' : 'パスワードが正しくありません。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { error: resetError } = await admin
    .from('admin_login_attempts')
    .update({ failed_attempts: 0, locked_until: null, updated_at: now.toISOString() })
    .eq('ip_hash', ipHash);
  if (resetError) {
    console.error('Admin auth failure counter reset failed:', resetError.code || 'unknown');
    return NextResponse.json({ success: false, message: '認証状態を更新できません。' }, { status: 503 });
  }

  const session = createAdminSessionToken();
  if (!session) {
    await writeAudit(admin, request, ipHash, method, 'failure', 'session_creation_failed');
    return NextResponse.json({ success: false, message: '管理者セッションを作成できませんでした。' }, { status: 503 });
  }

  const logged = await writeAudit(admin, request, ipHash, method, 'success', 'authenticated');
  if (!logged) {
    return NextResponse.json({ success: false, message: '監査ログを保存できないためログインを中止しました。' }, { status: 503 });
  }

  return NextResponse.json(
    { success: true, expiresAt: new Date(session.expiresAt * 1000).toISOString() },
    { headers: { 'Set-Cookie': serializeAdminSessionCookie(session.token), 'Cache-Control': 'no-store, private' } },
  );
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログアウト要求です。' }, { status: 403 });
  }
  if (verifyAdminSessionRequest(request)) {
    const admin = serviceClient();
    if (admin) {
      const logged = await writeAudit(admin, request, getIpHash(request), 'session', 'logout', 'user_logout');
      if (!logged) {
        return NextResponse.json({ success: false, message: 'ログアウト記録を保存できません。' }, { status: 503 });
      }
    }
  }
  return NextResponse.json(
    { success: true },
    { headers: { 'Set-Cookie': clearAdminSessionCookie(), 'Cache-Control': 'no-store, private' } },
  );
}
