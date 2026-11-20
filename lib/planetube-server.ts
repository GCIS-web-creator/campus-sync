import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const PLANETUBE_ALLOWED_SCOPES = [
  'planet:read',
  'focus:sync',
  'extension:control',
  'contribution:sync',
] as const;

export type PlanetubeScope = (typeof PLANETUBE_ALLOWED_SCOPES)[number];
export const NO_STORE = {
  'Cache-Control': 'no-store, private',
  Vary: 'Authorization',
};

type AuthorizedCampusUser = { user: User; admin: SupabaseClient };

export function planetubeFail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: NO_STORE });
}

function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getPlanetubeAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function authorizePlanetubeUser(
  request: Request,
  requireSameOrigin = false,
): Promise<AuthorizedCampusUser | NextResponse> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== requestUrl.origin) {
    return planetubeFail('別のサイトからのリクエストは受け付けません。', 403);
  }
  if (requireSameOrigin && !origin && request.headers.get('sec-fetch-site') !== 'same-origin') {
    return planetubeFail('リクエスト元を確認できません。', 403);
  }

  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return planetubeFail('CampusSyncにログインしてください。', 401);

  const publicClient = getPublicClient();
  const admin = getPlanetubeAdmin();
  if (!publicClient || !admin) return planetubeFail('Planetube連携用のサーバー設定が不足しています。', 503);

  const { data, error } = await publicClient.auth.getUser(match[1]);
  if (error || !data.user) return planetubeFail('ログイン状態を確認できません。再度ログインしてください。', 401);
  return { user: data.user, admin };
}

export function hashPlanetubeSecret(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function isPlanetubeIntegrationSecretValid(provided: string, expected: string) {
  if (!provided || expected.length < 32) return false;
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

export function readPlanetubeIntegrationSecret(request: Request) {
  const expected = process.env.PLANETUBE_INTEGRATION_SECRET || '';
  const provided = request.headers.get('x-planetube-integration-secret') || '';
  return isPlanetubeIntegrationSecretValid(provided, expected);
}

export function isPlanetubeScope(value: unknown): value is PlanetubeScope {
  return typeof value === 'string' && (PLANETUBE_ALLOWED_SCOPES as readonly string[]).includes(value);
}

export function getPlanetubeAdminForPartner() {
  return getPlanetubeAdmin();
}
