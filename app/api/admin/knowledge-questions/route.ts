import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { validateKnowledgeQuestion } from '@/lib/campus-knowledge-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store, max-age=0, private', Vary: 'Cookie' },
});

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('知識問題管理のサーバー設定が不足しています。');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function authorize(request: Request): NextResponse | null {
  if (!verifyAdminSessionRequest(request)) return json({ success: false, message: 'Adminログインが必要です。' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, 503);
  }
  return null;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}

function contentHash(value: { subject: string; subject_code: string | null; unit: string; prompt: string }) {
  const normalized = [
    value.subject_code || value.subject,
    value.unit,
    value.prompt.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ').trim(),
  ].join('\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.from('campus_knowledge_questions')
      .select('id,subject,subject_code,unit,title,prompt,question_type,options,correct_option_id,correct_answer,answer_tolerance,explanation,difficulty,target_class,status,source_name,source_url,source_license,source_attribution,source_revision,content_hash,created_at,published_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return json({ success: true, questions: data || [] });
  } catch (error) {
    console.error('[admin/knowledge-questions] GET failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '知識問題一覧を取得できませんでした。' }, 500);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ success: false, message: '不正な管理操作です。' }, 403);
  const denied = authorize(request);
  if (denied) return denied;
  const validated = validateKnowledgeQuestion(await request.json().catch(() => null));
  if (validated.error || !validated.value) {
    return json({ success: false, message: validated.error || '問題内容を確認してください。' }, 400);
  }

  try {
    const admin = getAdminClient();
    const value = validated.value;
    const hash = contentHash(value);
    const { data, error } = await admin.from('campus_knowledge_questions').insert({
      ...value,
      content_hash: hash,
      created_by_label: 'CampusSync Admin',
      published_at: value.status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).select('id,subject,unit,title,question_type,difficulty,target_class,status,source_name,source_url,created_at,published_at').single();
    if (error?.code === '23505') return json({ success: false, message: '同じ単元・問題文の問題がすでに登録されています。重複を確認してください。' }, 409);
    if (error) throw error;
    return json({ success: true, question: data }, 201);
  } catch (error) {
    console.error('[admin/knowledge-questions] POST failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '知識問題を保存できませんでした。' }, 500);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ success: false, message: '不正な管理操作です。' }, 403);
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null;
  if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return json({ success: false, message: '問題IDが正しくありません。' }, 400);
  }
  if (body.action !== 'publish' && body.action !== 'archive') {
    return json({ success: false, message: '操作内容が正しくありません。' }, 400);
  }

  try {
    const admin = getAdminClient();
    const update = body.action === 'publish'
      ? { status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: 'archived', updated_at: new Date().toISOString() };
    const allowedStatuses = body.action === 'publish' ? ['draft'] : ['draft', 'published'];
    const { data, error } = await admin.from('campus_knowledge_questions')
      .update(update)
      .eq('id', body.id)
      .in('status', allowedStatuses)
      .select('id,status,published_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return json({ success: false, message: '対象問題が見つからないか、状態が変更済みです。' }, 409);
    return json({ success: true, question: data });
  } catch (error) {
    console.error('[admin/knowledge-questions] PATCH failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '問題状態を更新できませんでした。' }, 500);
  }
}
