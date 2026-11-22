import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getPlanetTechnologyNode } from '@/lib/planet-technology-tree';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('惑星研究システムのサーバー設定が不足しています。');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser(request: NextRequest): Promise<User | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Supabaseの公開設定がありません。');
  }
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  const token = match?.[1]?.trim();
  if (!token) return null;

  const response = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: 'Bearer ' + token,
    },
    cache: 'no-store',
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return null;
  if (!SCHOOL_EMAIL.test(String(user.email || '').trim().toLowerCase())) return null;
  return user as User;
}

async function getOwner(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  return { user, admin: getAdminClient() };
}

async function ensurePlanet(admin: ReturnType<typeof getAdminClient>, userId: string) {
  const { error: createError } = await admin.from('campus_planets')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (createError) throw createError;

  const { data: planet, error: planetError } = await admin.from('campus_planets')
    .select('id,civilization_stage')
    .eq('user_id', userId)
    .single();
  if (planetError || !planet) throw planetError || new Error('惑星データを取得できません。');
  return planet;
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const planet = await ensurePlanet(owner.admin, owner.user.id);
    const [{ data: mpSummary, error: mpError }, { data: unlocks, error: unlockError }] = await Promise.all([
      owner.admin.rpc('campus_get_planet_mp_summary', { p_user_id: owner.user.id }),
      owner.admin.from('campus_planet_technology_unlocks')
        .select('node_id,branch_id,node_type,node_title,unlocked_at,mp_cost')
        .eq('user_id', owner.user.id)
        .order('unlocked_at', { ascending: true }),
    ]);
    if (mpError) throw mpError;
    if (unlockError) throw unlockError;

    return json({
      success: true,
      civilizationStage: Number(planet.civilization_stage || 0),
      mpSummary,
      purchasedNodeIds: (unlocks || []).map(row => row.node_id),
      purchasedNodes: unlocks || [],
    });
  } catch (error) {
    console.error('[planet-technology-tree] GET failed:', error);
    return json({ success: false, message: '研究ツリーを読み込めませんでした。' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const body = await request.json().catch(() => null) as { node_id?: unknown } | null;
    if (!body || typeof body.node_id !== 'string' || body.node_id.length > 180) {
      return json({ success: false, message: '研究ノードの指定が正しくありません。' }, 400);
    }

    const node = getPlanetTechnologyNode(body.node_id);
    if (!node) return json({ success: false, message: 'この研究ノードは存在しません。' }, 404);

    const { data, error } = await owner.admin.rpc('campus_unlock_planet_technology', {
      p_user_id: owner.user.id,
      p_node_id: node.id,
      p_branch_id: node.branchId,
      p_node_type: node.nodeType,
      p_node_title: node.title,
      p_parent_node_id: node.parentNodeId,
      p_cost_mp: node.costMp,
      p_required_stage: node.requiredStage,
    });
    if (error) {
      const message = String(error.message || '');
      if (/MPが不足|文明 Stage|先行研究|すでに解放済み/.test(message)) {
        return json({ success: false, message }, 409);
      }
      console.error('[planet-technology-tree] purchase failed:', message);
      return json({ success: false, message: '研究の解放に失敗しました。再読み込みしてからお試しください。' }, 500);
    }
    return json({ success: true, ...data });
  } catch (error) {
    console.error('[planet-technology-tree] POST failed:', error);
    return json({ success: false, message: '研究を解放できませんでした。' }, 500);
  }
}
