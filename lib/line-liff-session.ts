import { createHmac, timingSafeEqual } from 'node:crypto';

export const LINE_LIFF_SESSION_COOKIE = 'campussync_liff_session';
const SESSION_TTL_SECONDS = 45 * 60;
const LINE_USER_ID_PATTERN = /^U[A-Za-z0-9]{20,40}$/;

type LineIdTokenClaims = {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
};

function getSessionSecret(): string | null {
  const secret = process.env.LINE_LIFF_SESSION_SECRET || '';
  return secret.length >= 32 ? secret : null;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

export async function verifyLineLiffIdToken(idToken: string): Promise<{ lineUserId: string; tokenExpiresAt: number } | null> {
  const channelId = process.env.LINE_LIFF_CHANNEL_ID || '';
  if (!channelId || !idToken || idToken.length > 12000) return null;

  try {
    const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const claims = await response.json() as LineIdTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== 'https://access.line.me') return null;
    if (claims.aud !== channelId) return null;
    if (typeof claims.sub !== 'string' || !LINE_USER_ID_PATTERN.test(claims.sub)) return null;
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
    if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > now + 120) return null;

    return { lineUserId: claims.sub, tokenExpiresAt: claims.exp };
  } catch {
    return null;
  }
}

export function createLineLiffSessionCookieValue(lineUserId: string, tokenExpiresAt: number): { value: string; maxAge: number } | null {
  const secret = getSessionSecret();
  if (!secret || !LINE_USER_ID_PATTERN.test(lineUserId)) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(tokenExpiresAt, now + SESSION_TTL_SECONDS);
  if (expiresAt <= now) return null;

  const payload = Buffer.from(JSON.stringify({ sub: lineUserId, exp: expiresAt }), 'utf8').toString('base64url');
  return { value: payload + '.' + sign(payload, secret), maxAge: expiresAt - now };
}

export function getLineLiffSessionSubject(request: Request): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const value = getCookieValue(request, LINE_LIFF_SESSION_COOKIE);
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = sign(parts[0], secret);
  if (!safeEqual(parts[1], expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as { sub?: unknown; exp?: unknown };
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== 'string' || !LINE_USER_ID_PATTERN.test(payload.sub)) return null;
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function isLineLiffSessionConfigured(): boolean {
  return Boolean(process.env.LINE_LIFF_CHANNEL_ID && getSessionSecret());
}
