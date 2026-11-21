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
  status, headers: { 'Cache-Control': 'no-store, max-age=0, private', Vary: 'Cookie' },
});

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ success: false, message: '不正な管理操作です。' }, 403);
  if (!verifyAdminSessionRequest(request)) return json({ success: false, message: 'Adminログインが必要です。' }, 401);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, 503);
  }

  const body = await request.json().catch(() => null) as { items?: unknown } | null;
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 100) {
    return json({ success: false, message: '一括登録は1〜100問のJSON配列にしてください。' }, 400);
  }

  const prepared: Array<Record<string, unknown>> = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const validated = validateKnowledgeQuestion(body.items[index]);
    if (validated.error || !validated.value) {
      return json({ success: false, message: (index + 1) + '問目: ' + (validated.error || '問題データが正しくありません。') }, 400);
    }
    const value = validated.value;
    if (!value.source_url || !value.source_license || !value.source_attribution) {
      return json({ success: false, message: (index + 1) + '問目: 外部教材のURL・ライセンス・出典表示が必要です。' }, 400);
    }
    const normalized = [
      value.subject_code || value.subject,
      value.unit,
      value.prompt.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ').trim(),
    ].join('\n');
    const content_hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
    prepared.push({
      ...value,
      content_hash,
      status: 'draft',
      published_at: null,
      created_by_label: 'CampusSync Source Import',
      updated_at: new Date().toISOString(),
    });
  }

  const batchHashes = new Set<string>();
  const distinctRows = prepared.filter(row => {
    const hash = String(row.content_hash);
    if (batchHashes.has(hash)) return false;
    batchHashes.add(hash);
    return true;
  });
  const duplicateInBatch = prepared.length - distinctRows.length;

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const hashes = distinctRows.map(row => String(row.content_hash));
    const { data: existing, error: lookupError } = await admin.from('campus_knowledge_questions')
      .select('content_hash').in('content_hash', hashes);
    if (lookupError) throw lookupError;
    const existingHashes = new Set((existing || []).map(row => row.content_hash));
    const insertRows = distinctRows.filter(row => !existingHashes.has(String(row.content_hash)));
    const duplicateExisting = distinctRows.length - insertRows.length;

    if (insertRows.length === 0) {
      return json({
        success: true, imported: 0,
        duplicates: duplicateInBatch + duplicateExisting,
        review_required: 0,
        message: 'すべて重複としてスキップしました。既存問題は変更していません。',
      });
    }
    const { data, error } = await admin.from('campus_knowledge_questions')
      .insert(insertRows)
      .select('id');
    if (error?.code === '23505') {
      return json({ success: false, message: '同時登録中に重複を検出しました。もう一度一覧を更新してください。' }, 409);
    }
    if (error) throw error;

    return json({
      success: true,
      imported: data?.length || 0,
      duplicates: duplicateInBatch + duplicateExisting,
      review_required: data?.length || 0,
      message: '問題を下書きとして取り込みました。内容を確認してから公開してください。',
    }, 201);
  } catch (error) {
    console.error('[admin/knowledge-questions/import] POST failed:', error instanceof Error ? error.message : 'unknown');
    return json({ success: false, message: '問題の一括登録に失敗しました。' }, 500);
  }
}
