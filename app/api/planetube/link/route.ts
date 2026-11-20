import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  authorizePlanetubeUser,
  hashPlanetubeSecret,
  isPlanetubeScope,
  NO_STORE,
  planetubeFail,
} from '@/lib/planetube-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_CONNECTION_COLUMNS =
  'id,status,planetube_user_id,approved_scopes,planet_level,planet_growth_points,planet_synced_at,last_extension_seen_at,created_at,updated_at,linked_at,revoked_at';

export async function GET(request: Request) {
  const auth = await authorizePlanetubeUser(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.admin
    .from('planetube_connections')
    .select(SAFE_CONNECTION_COLUMNS)
    .eq('campus_user_id', auth.user.id)
    .maybeSingle();

  if (error) {
    console.error('Planetube connection read failed:', error.message);
    return planetubeFail('連携状態を読み込めませんでした。', 500);
  }
  return NextResponse.json({ success: true, connection: data || null }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = await authorizePlanetubeUser(request, true);
  if (auth instanceof NextResponse) return auth;

  const { data: existing, error: existingError } = await auth.admin
    .from('planetube_connections')
    .select('id,status')
    .eq('campus_user_id', auth.user.id)
    .maybeSingle();
  if (existingError) return planetubeFail('現在の連携状態を確認できません。', 500);
  if (existing?.status === 'linked') {
    return planetubeFail('すでにPlanetubeと連携済みです。先に連携を解除してください。', 409);
  }

  const code = randomBytes(10).toString('hex').toUpperCase();
  const normalizedCode = code;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await auth.admin.from('planetube_connections').upsert({
    campus_user_id: auth.user.id,
    planetube_user_id: null,
    status: 'pending',
    pairing_code_hash: hashPlanetubeSecret(normalizedCode),
    pairing_code_expires_at: expiresAt,
    approved_scopes: [],
    planet_level: null,
    planet_growth_points: null,
    planet_synced_at: null,
    last_extension_seen_at: null,
    updated_at: new Date().toISOString(),
    linked_at: null,
    revoked_at: null,
  }, { onConflict: 'campus_user_id' });

  if (error) {
    console.error('Planetube pairing code issue failed:', error.message);
    return planetubeFail('連携コードを発行できませんでした。', 500);
  }

  return NextResponse.json({
    success: true,
    pairingCode: code,
    expiresAt,
    expiresInSeconds: 900,
  }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const auth = await authorizePlanetubeUser(request, true);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null) as { approvedScopes?: unknown } | null;
  if (!body || !Array.isArray(body.approvedScopes) || body.approvedScopes.some((scope) => !isPlanetubeScope(scope))) {
    return planetubeFail('許可するデータ範囲の指定が正しくありません。', 400);
  }
  const approvedScopes = Array.from(new Set(body.approvedScopes));
  const { data: existing, error: readError } = await auth.admin
    .from('planetube_connections')
    .select('id,status')
    .eq('campus_user_id', auth.user.id)
    .maybeSingle();
  if (readError) return planetubeFail('連携状態を確認できません。', 500);
  if (!existing || existing.status === 'revoked') return planetubeFail('Planetube連携が開始されていません。', 404);

  const { error } = await auth.admin.from('planetube_connections').update({
    approved_scopes: approvedScopes,
    updated_at: new Date().toISOString(),
  }).eq('id', existing.id);
  if (error) return planetubeFail('データ利用範囲を保存できませんでした。', 500);
  return NextResponse.json({ success: true, approvedScopes }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const auth = await authorizePlanetubeUser(request, true);
  if (auth instanceof NextResponse) return auth;

  const { error } = await auth.admin.from('planetube_connections').update({
    status: 'revoked',
    planetube_user_id: null,
    pairing_code_hash: null,
    pairing_code_expires_at: null,
    approved_scopes: [],
    planet_level: null,
    planet_growth_points: null,
    planet_synced_at: null,
    last_extension_seen_at: null,
    revoked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('campus_user_id', auth.user.id);

  if (error) return planetubeFail('連携を解除できませんでした。', 500);
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
