import { NextResponse } from 'next/server';
import {
  getPlanetubeAdminForPartner,
  hashPlanetubeSecret,
  isPlanetubeIntegrationSecretValid,
  NO_STORE,
  planetubeFail,
} from '@/lib/planetube-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const expected = process.env.PLANETUBE_INTEGRATION_SECRET || '';
  const provided = request.headers.get('x-planetube-integration-secret') || '';
  if (!isPlanetubeIntegrationSecretValid(provided, expected)) {
    return planetubeFail('Planetubeサーバー認証に失敗しました。', 401);
  }

  const admin = getPlanetubeAdminForPartner();
  if (!admin) return planetubeFail('サーバーのDB接続設定が不足しています。', 503);
  const body = await request.json().catch(() => null) as {
    pairingCode?: unknown;
    planetubeUserId?: unknown;
  } | null;
  const code = typeof body?.pairingCode === 'string'
    ? body.pairingCode.toUpperCase().replace(/[^A-F0-9]/g, '')
    : '';
  if (!body || !/^[A-F0-9]{20}$/.test(code) || !isUuid(body.planetubeUserId)) {
    return planetubeFail('連携コードまたはPlanetubeユーザーIDが正しくありません。', 400);
  }

  const now = new Date().toISOString();
  const { data: pending, error: lookupError } = await admin
    .from('planetube_connections')
    .select('id,approved_scopes')
    .eq('pairing_code_hash', hashPlanetubeSecret(code))
    .eq('status', 'pending')
    .gt('pairing_code_expires_at', now)
    .maybeSingle();
  if (lookupError) return planetubeFail('連携コードを照合できませんでした。', 500);
  if (!pending) return planetubeFail('連携コードが無効か、有効期限が切れています。', 404);

  const { data: updated, error: updateError } = await admin
    .from('planetube_connections')
    .update({
      planetube_user_id: body.planetubeUserId,
      status: 'linked',
      pairing_code_hash: null,
      pairing_code_expires_at: null,
      linked_at: now,
      revoked_at: null,
      updated_at: now,
    })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .eq('pairing_code_hash', hashPlanetubeSecret(code))
    .select('id,approved_scopes')
    .maybeSingle();

  if (updateError) {
    console.error('Planetube pairing exchange failed:', updateError.message);
    return planetubeFail('アカウントを紐付けできませんでした。', 409);
  }
  if (!updated) return planetubeFail('この連携コードはすでに使用されています。', 409);

  return NextResponse.json({
    success: true,
    linked: true,
    connectionId: updated.id,
    approvedScopes: updated.approved_scopes || [],
  }, { headers: NO_STORE });
}
