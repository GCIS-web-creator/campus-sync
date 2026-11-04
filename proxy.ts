import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSessionToken } from '@/lib/admin-auth';

const MANUAL_LINE_ENDPOINTS = new Set([
  '/api/line-daily-digest',
  '/api/line-weekly-school-schedule',
  '/api/line-class-timetable',
  '/api/line-train-timetable',
]);

function secureEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  const auth = request.headers.get('authorization') || '';
  const received = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return secureEqual(expected, received);
}

async function manualLineRequest(request: NextRequest): Promise<boolean> {
  const body = await request.clone().json().catch(() => null) as { mode?: unknown } | null;
  return body?.mode === 'manual';
}

function denied() {
  return NextResponse.json(
    { success: false, message: '管理者ログインが必要です。' },
    { status: 401, headers: { 'Cache-Control': 'no-store, private' } },
  );
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  const token = request.cookies.get('campussync_admin_session')?.value || '';
  const authenticated = verifyAdminSessionToken(token);

  if (path === '/api/admin/auth') return NextResponse.next();

  const adminPage = path === '/admin' || path.startsWith('/admin/');
  if (adminPage && !authenticated) {
    return NextResponse.redirect(new URL('/admin-login', request.url));
  }

  const adminApi = path.startsWith('/api/admin/');
  const schoolCountdownPath = path === '/api/school-countdowns';
  const schoolCountdownRead = schoolCountdownPath && (method === 'GET' || method === 'HEAD');
  const schoolCountdownWrite = schoolCountdownPath && !schoolCountdownRead;
  const adminWrite = path === '/api/line-broadcast'
    || (path === '/api/school-schedule' && method !== 'GET' && method !== 'HEAD')
    || (path === '/api/campus-facilities' && method !== 'GET' && method !== 'HEAD');

  // カウントダウンのGETは生徒にも公開する。Adminセッションがある場合だけ
  // 管理者用ヘッダーを付け、非公開・過去イベントも取得できるようにする。
  if (schoolCountdownRead && !authenticated) return NextResponse.next();

  let needsSession = adminApi || schoolCountdownWrite || adminWrite;
  if (MANUAL_LINE_ENDPOINTS.has(path) && await manualLineRequest(request) && !validCron(request)) {
    needsSession = true;
  }

  if (!needsSession && !(schoolCountdownRead && authenticated)) return NextResponse.next();
  if (!authenticated) return denied();

  const headers = new Headers(request.headers);
  headers.set('x-admin-password', process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/school-schedule',
    '/api/school-countdowns',
    '/api/campus-facilities',
    '/api/line-broadcast',
    '/api/line-daily-digest',
    '/api/line-weekly-school-schedule',
    '/api/line-class-timetable',
    '/api/line-train-timetable',
  ],
};
