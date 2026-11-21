import { createClient, type User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { validateKnowledgeAttempt } from '@/lib/campus-knowledge-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;
const PAGE_SIZE_DEFAULT = 18;
const PAGE_SIZE_MAX = 50;

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

  const response = await fetch(SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', {
    method: 'GET',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token },
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

    const params = request.nextUrl.searchParams;
    const requestedPage = Number(params.get('page') || 1);
    const requestedSize = Number(params.get('page_size') || PAGE_SIZE_DEFAULT);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
    const pageSize = Number.isInteger(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, PAGE_SIZE_MAX) : PAGE_SIZE_DEFAULT;
    const subjectCode = String(params.get('subject') || '').trim();
    const unit = String(params.get('unit') || '').trim().slice(0, 120);
    const difficulty = String(params.get('difficulty') || '').trim();
    const allowedSubjectCodes = new Set(['math1', 'matha', 'math2', 'mathb', 'math3', 'mathc']);
    const allowedDifficulties = new Set(['normal', 'advanced', 'challenge']);
    if (subjectCode && !allowedSubjectCodes.has(subjectCode)) return json({ success: false, message: '教科フィルターが正しくありません。' }, 400);
    if (difficulty && !allowedDifficulties.has(difficulty)) return json({ success: false, message: '難易度フィルターが正しくありません。' }, 400);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const targetClasses = context.userClass ? ['all', context.userClass] : ['all'];
    let questionsQuery = context.admin.from('campus_knowledge_questions')
      .select('id,subject,subject_code,unit,title,prompt,question_type,options,difficulty,target_class,source_name,source_url,source_license,source_attribution', { count: 'exact' })
      .eq('status', 'published')
      .in('target_class', targetClasses)
      .order('subject_code', { ascending: true })
      .order('unit', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (subjectCode) questionsQuery = questionsQuery.eq('subject_code', subjectCode);
    if (unit) questionsQuery = questionsQuery.ilike('unit', '%' + unit.replace(/[%_]/g, '') + '%');
    if (difficulty) questionsQuery = questionsQuery.eq('difficulty', difficulty);

    const [{ data: questions, count, error: questionsError }, { data: attempts, error: attemptsError }, { data: masteredRows, error: masteredError }, { data: growth, error: growthError }] = await Promise.all([
      questionsQuery,
      context.admin.from('campus_knowledge_attempts')
        .select('id,question_id,selected_option_id,selected_answer,is_correct,is_graded,xp_awarded,attempted_at')
        .eq('user_id', context.user.id)
        .order('attempted_at', { ascending: false })
        .limit(200),
      context.admin.from('campus_knowledge_attempts')
        .select('question_id')
        .eq('user_id', context.user.id)
        .eq('is_correct', true)
        .eq('is_graded', true)
        .limit(10000),
      context.admin.from('campus_planet_growth')
        .select('knowledge_xp')
        .eq('user_id', context.user.id)
        .maybeSingle(),
    ]);
    if (questionsError || attemptsError || masteredError || growthError) {
      throw questionsError || attemptsError || masteredError || growthError;
    }

    return json({
      success: true,
      questions: questions || [],
      attempts: attempts || [],
      masteredQuestionIds: [...new Set((masteredRows || []).map(row => row.question_id))],
      knowledgeXp: Number(growth?.knowledge_xp || 0),
      pagination: {
        page,
        pageSize,
        totalCount: Number(count || 0),
        totalPages: Math.max(1, Math.ceil(Number(count || 0) / pageSize)),
      },
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
      p_selected_answer: validated.value.selected_answer,
    });
    if (error) {
      const message = String(error.message || '');
      if (/対象クラス|公開されていません|選択肢|数値|解答|送信ID|回答形式/.test(message)) {
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
