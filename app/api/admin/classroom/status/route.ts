import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getClassroomOAuthConfig } from '@/lib/classroom-oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return NextResponse.json({ configured: false, message: '管理者セッションが必要です。' }, { status: 401 });
  const config = getClassroomOAuthConfig(new URL(request.url).origin);
  return NextResponse.json({ configured: config.configured, callbackUri: config.redirectUri, tokenStorage: false }, { headers: { 'Cache-Control': 'no-store, private' } });
}