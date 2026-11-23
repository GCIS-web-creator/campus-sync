import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const EIKEN_VOCAB_SESSION_COOKIE = 'campussync_eiken_vocab_session';
export const EIKEN_VOCAB_SESSION_TTL_SECONDS = 8 * 60 * 60;

function sign(secret: string, expiresAt: number, nonce: string): string {
  return createHmac('sha256', secret)
    .update('campussync-eiken-vocab-session:v1:' + expiresAt + ':' + nonce)
    .digest('base64url');
}

export function createEikenVocabSessionToken(secret: string, now = Date.now()) {
  if (secret.length < 8) return null;
  const expiresAt = Math.floor(now / 1000) + EIKEN_VOCAB_SESSION_TTL_SECONDS;
  const nonce = randomBytes(18).toString('base64url');
  const signature = sign(secret, expiresAt, nonce);
  return signature ? { token: expiresAt + '.' + nonce + '.' + signature, expiresAt } : null;
}

export function verifyEikenVocabSessionToken(
  token: string | null | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token || secret.length < 8) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const expiresAt = Number(parts[0]);
  const nonce = parts[1];
  const current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= current || expiresAt > current + EIKEN_VOCAB_SESSION_TTL_SECONDS + 60) {
    return false;
  }
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return false;
  const expected = Buffer.from(sign(secret, expiresAt, nonce));
  const received = Buffer.from(parts[2]);
  return expected.length > 0 && expected.length === received.length && timingSafeEqual(expected, received);
}

export function getEikenVocabSessionTokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== EIKEN_VOCAB_SESSION_COOKIE) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

export function verifyEikenVocabSessionRequest(request: Request, secret: string): boolean {
  return verifyEikenVocabSessionToken(
    getEikenVocabSessionTokenFromCookieHeader(request.headers.get('cookie')),
    secret,
  );
}

export function verifyEikenVocabPassword(value: unknown, expectedPassword: string): boolean {
  if (expectedPassword.length < 8 || typeof value !== 'string' || value.length < 8 || value.length > 256) return false;
  const expected = Buffer.from(expectedPassword, 'utf8');
  const received = Buffer.from(value, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function serializeEikenVocabSessionCookie(token: string): string {
  return [
    EIKEN_VOCAB_SESSION_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + EIKEN_VOCAB_SESSION_TTL_SECONDS,
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export function clearEikenVocabSessionCookie(): string {
  return [
    EIKEN_VOCAB_SESSION_COOKIE + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}
