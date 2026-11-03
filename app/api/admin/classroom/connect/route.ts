import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { createClassroomOAuthState, getClassroomOAuthConfig, serializeClassroomStateCookie, CLASSROOM_SCOPES } from '@/lib/classroom-oauth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return NextResponse.json({ message: 'CampusSync管理者としてログインしてください。' }, { status: 401 });
  const config = getClassroomOAuthConfig(new URL(request.url).origin);
  if (!config.configured) return NextResponse.json({ message: 'GOOGLE_CLASSROOM_CLIENT_ID と GOOGLE_CLASSROOM_CLIENT_SECRET がVercelに設定されていません。' }, { status: 503 });
  const state = createClassroomOAuthState(config.clientSecret);
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', config.clientId); authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code'); authUrl.searchParams.set('scope', CLASSROOM_SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'online'); authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'consent select_account'); authUrl.searchParams.set('state', state.state);
  return NextResponse.redirect(authUrl, { headers: { 'Set-Cookie': serializeClassroomStateCookie(state.nonce), 'Cache-Control': 'no-store' } });
}