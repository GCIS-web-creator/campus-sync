import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateKnowledgeAttempt } from '@/lib/campus-knowledge-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0, private' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('知識問題のサーバー設定が不足しています。');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
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
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) return null;
  if (!SCHOOL_EMAIL.test(String(user.email || '').trim().toLowerCase())) return null;
  return user as User;
}

async function getStudentContext(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;
  const admin = getAdminClient();
  const { data: profile, error } = await admin.from('profiles')
    .select('user_class')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return { user, admin, userClass: String(profile?.user_class || '').trim() };
}

export async function GET(request: NextRequest) {
  try {
    const context = await getStudentContext(request);
    if (!context) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const [{ data: questions, error: questionsError }, { data: attempts, error: attemptsError }, { data: growth, error: growthError }] = await Promise.all([
      context.admin.from('campus_knowledge_questions')
        .select('id,subject,title,prompt,options,difficulty,target_class,created_at')
        .eq('status', 'published')
        .order('subject', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(200),
      context.admin.from('campus_knowledge_attempts')
        .select('id,question_id,selected_option_id,is_correct,xp_awarded,attempted_at')
        .eq('user_id', context.user.id)
        .order('attempted_at', { ascending: false })
        .limit(200),
      context.admin.from('campus_planet_growth')
        .select('knowledge_xp')
        .eq('user_id', context.user.id)
        .maybeSingle(),
    ]);
    if (questionsError || attemptsError || growthError) throw questionsError || attemptsError || growthError;

    const visibleQuestions = (questions || []).filter(question =>
      question.target_class === 'all' || question.target_class === context.userClass
    );
    const attemptRows = attempts || [];
    const masteredQuestionIds = [...new Set(attemptRows.filter(row => row.is_correct).map(row => row.question_id))];

    return json({
      success: true,
      questions: visibleQuestions,
      attempts: attemptRows,
      masteredQuestionIds,
      knowledgeXp: Number(growth?.knowledge_xp || 0),
    });
  } catch (error) {
    console.error('[knowledge-practice] GET failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '知識問題を読み込めませんでした。' }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getStudentContext(request);
    if (!context) return json({ success: false, message: 'ログインが必要です。' }, 401);

    const body = await request.json().catch(() => null);
    const validated = validateKnowledgeAttempt(body);
    if (validated.error || !validated.value) {
      return json({ success: false, message: validated.error || '回答内容を確認してください。' }, 400);
    }

    const { data, error } = await context.admin.rpc('campus_submit_knowledge_attempt', {
      p_user_id: context.user.id,
      p_question_id: validated.value.question_id,
      p_client_attempt_id: validated.value.attempt_id,
      p_selected_option_id: validated.value.selected_option_id,
      p_user_class: context.userClass,
    });
    if (error) {
      const message = String(error.message || '');
      if (/対象クラス|公開されていません|選択肢|送信ID/.test(message)) {
        return json({ success: false, message }, 400);
      }
      console.error('[knowledge-practice] grading failed:', message);
      return json({ success: false, message: '回答を採点できませんでした。もう一度お試しください。' }, 500);
    }

    const { data: growth, error: growthError } = await context.admin.from('campus_planet_growth')
      .select('knowledge_xp,civilization_score')
      .eq('user_id', context.user.id)
      .maybeSingle();
    if (growthError) throw growthError;

    return json({
      success: true,
      result: data,
      knowledgeXp: Number(growth?.knowledge_xp || 0),
      civilizationScore: Number(growth?.civilization_score || 0),
    });
  } catch (error) {
    console.error('[knowledge-practice] POST failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '回答を送信できませんでした。' }, 500);
  }
}
