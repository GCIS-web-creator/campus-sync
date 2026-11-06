import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createTeacherAccessCode(): string {
  const bytes = randomBytes(16);
  const value = Array.from(bytes, byte => CODE_ALPHABET[byte & 31]).join('');
  return 'TCH-' + value.match(/.{1,4}/g)!.join('-');
}

export function normalizeTeacherAccessCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^TCH[A-Z0-9]{16}$/.test(normalized) ? normalized : '';
}

export function hashTeacherSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function getTokyoDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getTeacherAccessAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const TEACHER_SESSION_COOKIE = 'campussync_teacher_session';
export const TEACHER_SESSION_TTL_SECONDS = 8 * 60 * 60;

export function serializeTeacherSessionCookie(token: string): string {
  return [
    TEACHER_SESSION_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + TEACHER_SESSION_TTL_SECONDS,
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export function clearTeacherSessionCookie(): string {
  return [
    TEACHER_SESSION_COOKIE + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export function getTeacherSessionToken(request: Request): string {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== TEACHER_SESSION_COOKIE) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ''; }
  }
  return '';
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
