import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUBJECTS = ['国語演習','古典探求','古典探究','物理','化学','生物','数３','数C','数学C','数学Ⅱ','英コミュⅡ','保健（30分）','物理・生物','論理表現Ⅱ（30分）','公共','英コミュ','論表','情報','保健'] as const;
type Section = { section_id: string; kind: 'range' | 'notice'; title: string; body: string; note: string | null };

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
}
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseサーバー設定が不足しています。', 503);

  const payload = await request.json().catch(() => null) as {
    exam_id?: unknown;
    subject?: unknown;
    display_subject?: unknown;
    audience?: unknown;
    range_sections?: unknown;
  } | null;
  if (!payload) return fail('送信データを読み取れません。', 400);

  const examId = typeof payload.exam_id === 'string' ? payload.exam_id.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const displaySubject = typeof payload.display_subject === 'string' ? payload.display_subject.trim() : subject;
  const audience = typeof payload.audience === 'string' ? payload.audience : '';
  if (!examId) return fail('考査IDを確認してください。', 400);
  if (!SUBJECTS.includes(subject as typeof SUBJECTS[number])) return fail('教科の指定が正しくありません。', 400);
  if (!displaySubject || displaySubject.length > 80) return fail('表示教科名は80文字以内で入力してください。', 400);
  if (!['2年理系', '全生徒'].includes(audience)) return fail('対象範囲の指定が正しくありません。', 400);
  if (!Array.isArray(payload.range_sections) || payload.range_sections.length > 100) return fail('項目は100件以内で指定してください。', 400);

  const { data: exam, error: examError } = await admin.from('school_test_exams').select('id').eq('id', examId).maybeSingle();
  if (examError) return fail('考査を確認できませんでした。', 500);
  if (!exam) return fail('対象の考査が見つかりません。', 404);
  const { data: subjectRow, error: subjectError } = await admin.from('school_test_subjects')
    .select('subject,sort_order').eq('exam_id', examId).eq('subject', subject).maybeSingle();
  if (subjectError) return fail('考査の実施教科を確認できませんでした。', 500);
  if (!subjectRow) return fail('この考査に登録されていない教科です。', 400);

  const sections: Section[] = [];
  for (const raw of payload.range_sections) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('項目の形式が正しくありません。', 400);
    const row = raw as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const kind = row.kind === 'notice' ? 'notice' : row.kind === 'range' ? 'range' : null;
    if (!kind) return fail('項目は「出題範囲」または「お知らせ」を選択してください。', 400);
    if (!title || title.length > 200) return fail('項目名は1〜200文字で入力してください。', 400);
    if (body.length > 5000 || note.length > 1000) return fail('本文は5000文字、補足は1000文字以内にしてください。', 400);
    const sectionId = typeof row.section_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.section_id)
      ? row.section_id
      : randomUUID();
    sections.push({ section_id: sectionId, kind, title, body, note: note || null });
  }

  const { data, error } = await admin.from('school_test_ranges').upsert({
    exam_id: examId,
    subject,
    display_subject: displaySubject,
    audience,
    sort_order: subjectRow.sort_order,
    range_sections: sections,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'exam_id,audience,subject' }).select('*').single();

  if (error) return fail('試験範囲・お知らせを保存できませんでした。', 500);
  return NextResponse.json({ success: true, range: data }, { headers: { 'Cache-Control': 'no-store, private' } });
}
