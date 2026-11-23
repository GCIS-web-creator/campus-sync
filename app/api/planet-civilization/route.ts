import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('惑星システムのサーバー設定が不足しています。');
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

  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (!SCHOOL_EMAIL.test(email)) return null;
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
    .select('id,user_id,planet_name,planet_asset_id,civilization_stage,is_public,created_at,updated_at')
    .eq('user_id', userId)
    .single();
  if (planetError || !planet) throw planetError || new Error('惑星データを取得できません。');

  const { error: growthCreateError } = await admin.from('campus_planet_growth')
    .upsert({ planet_id: planet.id, user_id: userId }, { onConflict: 'planet_id', ignoreDuplicates: true });
  if (growthCreateError) throw growthCreateError;

  const { data: growth, error: growthError } = await admin.from('campus_planet_growth')
    .select('learning_xp,contribution_xp,knowledge_xp,nature_growth,technical_level,social_level,research_level,nature_level,civilization_score,recalculated_at,updated_at')
    .eq('planet_id', planet.id)
    .single();
  if (growthError || !growth) throw growthError || new Error('惑星の成長情報を取得できません。');

  return { planet, growth };
}

export async function GET(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const { planet, growth } = await ensurePlanet(owner.admin, owner.user.id);
    const { data: recentLedger, error: ledgerError } = await owner.admin.from('campus_xp_ledger')
      .select('id,xp_type,amount,entry_kind,adjustment_direction,source_type,source_id,source_date,reason,rule_version,created_at')
      .eq('user_id', owner.user.id)
      .order('created_at', { ascending: false })
      .limit(12);
    if (ledgerError) throw ledgerError;

    const ledger = recentLedger || [];
    const learningSessionIds = [...new Set(ledger
      .filter(entry => entry.xp_type === 'learning' && entry.source_type === 'student_study_session' && UUID.test(String(entry.source_id || '')))
      .map(entry => String(entry.source_id)))];

    let learningSessionsById = new Map<string, {
      id: string;
      subject_name: string;
      task_title: string;
      focus_seconds: number;
      break_seconds: number;
      started_at: string;
      finish_kind: 'completed' | 'stopped';
    }>();

    if (learningSessionIds.length) {
      const { data: learningSessions, error: sessionsError } = await owner.admin.from('student_study_sessions')
        .select('id,subject_name,task_title,focus_seconds,break_seconds,started_at,finish_kind')
        .eq('user_id', owner.user.id)
        .in('id', learningSessionIds);
      if (sessionsError) throw sessionsError;
      learningSessionsById = new Map((learningSessions || []).map(session => [session.id, session]));
    }

    const recentLedgerWithSources = ledger.map(entry => ({
      ...entry,
      source_session: learningSessionsById.get(String(entry.source_id || '')) || null,
    }));

    return json({ success: true, planet, growth, recentLedger: recentLedgerWithSources });
  } catch (error) {
    console.error('[planet-civilization] GET failed:', error);
    return json({ success: false, message: '惑星データを読み込めませんでした。' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await getOwner(request);
    if (!owner) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const body = await request.json().catch(() => null) as { action?: string; session_id?: string } | null;
    if (body?.action !== 'award-learning-xp' || !body.session_id || !UUID.test(body.session_id)) {
      return json({ success: false, message: 'リクエスト内容が正しくありません。' }, 400);
    }

    const { data, error } = await owner.admin.rpc('campus_award_learning_xp', {
      p_user_id: owner.user.id,
      p_session_id: body.session_id,
    });
    if (error) {
      console.error('[planet-civilization] Learning XP award failed:', error.message);
      return json({ success: false, message: '学習XPを反映できませんでした。あとで再試行してください。' }, 500);
    }

    return json({ success: true, result: data });
  } catch (error) {
    console.error('[planet-civilization] POST failed:', error);
    return json({ success: false, message: '惑星データを更新できませんでした。' }, 500);
  }
}
