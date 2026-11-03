import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const CLASSROOM_STATE_COOKIE = 'campussync_classroom_oauth_state';
export const CLASSROOM_SCOPES = ['https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.coursework.me.readonly'] as const;
export function getClassroomOAuthConfig(origin: string) {
  const clientId = process.env.GOOGLE_CLASSROOM_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLASSROOM_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.GOOGLE_CLASSROOM_REDIRECT_URI?.trim() || new URL('/api/admin/classroom/callback', origin).toString();
  return { clientId, clientSecret, redirectUri, configured: Boolean(clientId && clientSecret) };
}
function signState(nonce: string, secret: string): string { return createHmac('sha256', secret).update('campussync-classroom-oauth-state:v1:' + nonce).digest('base64url'); }
export function createClassroomOAuthState(secret: string) { const nonce = randomBytes(32).toString('base64url'); return { state: nonce + '.' + signState(nonce, secret), nonce }; }
export function verifyClassroomOAuthState(state: string, cookieNonce: string, secret: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] !== cookieNonce) return false;
  const expected = Buffer.from(signState(parts[0], secret)); const received = Buffer.from(parts[1]);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
export function getCookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(';')) { const separator = item.indexOf('='); if (separator < 0 || item.slice(0, separator).trim() !== name) continue; try { return decodeURIComponent(item.slice(separator + 1).trim()); } catch { return null; } }
  return null;
}
export function serializeClassroomStateCookie(nonce: string): string { return [CLASSROOM_STATE_COOKIE + '=' + encodeURIComponent(nonce), 'Path=/api/admin/classroom', 'HttpOnly', 'SameSite=Lax', 'Max-Age=600', ...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])].join('; '); }
export function clearClassroomStateCookie(): string { return [CLASSROOM_STATE_COOKIE + '=', 'Path=/api/admin/classroom', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', ...(process.env.NODE_ENV === 'production' ? ['Secure'] : [])].join('; '); }