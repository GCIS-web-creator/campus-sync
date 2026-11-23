import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  clearEikenVocabSessionCookie,
  createEikenVocabSessionToken,
  getEikenVocabSessionTokenFromCookieHeader,
  serializeEikenVocabSessionCookie,
  verifyEikenVocabPassword,
  verifyEikenVocabSessionToken,
} from '@/lib/eiken-vocab-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

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

function getIpHash(request: Request, password: string): string {
  return createHmac('sha256', password)
    .update('campussync-eiken-vocab-ip:v1:' + getRequestIp(request))
    .digest('hex');
}

function getConfiguredPassword(): string {
  return process.env.EIKEN_VOCAB_PASSWORD || '';
}

export async function GET(request: Request) {
  const password = getConfiguredPassword();
  const authenticated = password.length >= 8 && verifyEikenVocabSessionToken(
    getEikenVocabSessionTokenFromCookieHeader(request.headers.get('cookie')),
    password,
  );
  return NextResponse.json(
    { configured: password.length >= 8, authenticated },
    { headers: noStore },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログイン要求です。' }, { status: 403, headers: noStore });
  }

  const password = getConfiguredPassword();
  if (password.length < 8) {
    return NextResponse.json(
      { success: false, message: '英検単語学習のパスワードがサーバーに設定されていません。' },
      { status: 503, headers: noStore },
    );
  }

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, message: 'ログイン保護用のSupabaseサーバー設定が不足しています。' },
      { status: 503, headers: noStore },
    );
  }

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const ipHash = getIpHash(request, password);
  const now = new Date();
  const { data: attempt, error: attemptError } = await admin
    .from('admin_login_attempts')
    .select('failed_attempts, locked_until')
    .eq('ip_hash', ipHash)
    .maybeSingle();

  if (attemptError) {
    console.error('Eiken vocabulary login lock lookup failed:', attemptError.code || 'unknown');
    return NextResponse.json({ success: false, message: 'ログイン保護状態を確認できません。' }, { status: 503, headers: noStore });
  }

  const lockedUntil = attempt?.locked_until ? new Date(attempt.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > now.getTime()) {
    const remainingMinutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000));
    return NextResponse.json(
      { success: false, message: '連続失敗によりログインを一時停止中です。約' + remainingMinutes + '分後に再試行してください。' },
      { status: 423, headers: noStore },
    );
  }

  if (!verifyEikenVocabPassword(body?.password, password)) {
    const { data: failureRows, error: failureError } = await admin.rpc('record_admin_login_failure', {
      p_ip_hash: ipHash,
      p_now: now.toISOString(),
    });
    if (failureError) {
      console.error('Eiken vocabulary login failure counter update failed:', failureError.code || 'unknown');
      return NextResponse.json({ success: false, message: '失敗回数を記録できません。' }, { status: 503, headers: noStore });
    }
    const failure = Array.isArray(failureRows) ? failureRows[0] : failureRows;
    const newlyLockedUntil = failure?.locked_until ? new Date(failure.locked_until) : null;
    if (newlyLockedUntil && newlyLockedUntil.getTime() > now.getTime()) {
      return NextResponse.json(
        { success: false, message: MAX_FAILED_ATTEMPTS + '回連続で認証に失敗したため、' + LOCK_MINUTES + '分間ロックしました。' },
        { status: 423, headers: noStore },
      );
    }
    return NextResponse.json(
      { success: false, message: 'パスワードが正しくありません。' },
      { status: 401, headers: noStore },
    );
  }

  const { error: resetError } = await admin
    .from('admin_login_attempts')
    .update({ failed_attempts: 0, locked_until: null, updated_at: now.toISOString() })
    .eq('ip_hash', ipHash);
  if (resetError) {
    console.error('Eiken vocabulary login failure counter reset failed:', resetError.code || 'unknown');
    return NextResponse.json({ success: false, message: '認証状態を更新できません。' }, { status: 503, headers: noStore });
  }

  const session = createEikenVocabSessionToken(password);
  if (!session) {
    return NextResponse.json({ success: false, message: 'ログインセッションを作成できませんでした。' }, { status: 503, headers: noStore });
  }

  return NextResponse.json(
    { success: true, expiresAt: new Date(session.expiresAt * 1000).toISOString() },
    { headers: { ...noStore, 'Set-Cookie': serializeEikenVocabSessionCookie(session.token) } },
  );
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, message: '不正なログアウト要求です。' }, { status: 403, headers: noStore });
  }
  return NextResponse.json(
    { success: true },
    { headers: { ...noStore, 'Set-Cookie': clearEikenVocabSessionCookie() } },
  );
}
