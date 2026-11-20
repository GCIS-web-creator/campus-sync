import { NextResponse } from 'next/server';
import {
  getPlanetubeAdminForPartner,
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
    planetubeUserId?: unknown;
    planetLevel?: unknown;
    growthPoints?: unknown;
  } | null;
  if (!body || !isUuid(body.planetubeUserId) ||
      !Number.isInteger(body?.planetLevel) || Number(body.planetLevel) < 0 || Number(body.planetLevel) > 1_000_000 ||
      !Number.isInteger(body?.growthPoints) || Number(body.growthPoints) < 0 || Number(body.growthPoints) > 2_000_000_000) {
    return planetubeFail('惑星データの形式が正しくありません。', 400);
  }

  const now = new Date().toISOString();
  const { data: connection, error: lookupError } = await admin
    .from('planetube_connections')
    .select('id')
    .eq('planetube_user_id', body.planetubeUserId)
    .eq('status', 'linked')
    .contains('approved_scopes', ['planet:read'])
    .maybeSingle();
  if (lookupError) return planetubeFail('Planetube連携状態を確認できません。', 500);
  if (!connection) return planetubeFail('連携が存在しないか、惑星データの利用が許可されていません。', 403);

  const { error: updateError } = await admin.from('planetube_connections').update({
    planet_level: Number(body.planetLevel),
    planet_growth_points: Number(body.growthPoints),
    planet_synced_at: now,
    updated_at: now,
  }).eq('id', connection.id);
  if (updateError) return planetubeFail('惑星データを同期できませんでした。', 500);

  return NextResponse.json({ success: true, syncedAt: now }, { headers: NO_STORE });
}
