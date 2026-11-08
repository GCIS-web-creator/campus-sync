import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSIGNMENT_SUBJECTS = [
  '国語演習', '古典探求', '物理', '生物', '数３', '数C',
  '公共', '英コミュ', '論表', '情報', '保健', 'その他',
] as const;

type AssignmentType = 'paper' | 'classroom' | 'other';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
}

function parseTokyoDateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
  ) return undefined;

  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString();
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const admin = getAdminClient();
  if (!admin) return jsonError('課題登録サービスの設定を確認できません。', 503);

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError('送信内容を読み取れませんでした。', 400);
  }

  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) return jsonError('フォームのURLが正しくありません。公式アカウントからフォームを開き直してください。', 400);

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  const subject = typeof input.subject === 'string' ? input.subject : '';
  const targetClass = input.targetClass === 'science' ? 'science' : input.targetClass === 'all' ? 'all' : '';
  const subjectOptionInput = typeof input.subjectOption === 'string' ? input.subjectOption : '';
  const type = input.type as AssignmentType;
  const dueAt = input.noDeadline === true ? null : parseTokyoDateTime(input.dueAt);

  if (!ASSIGNMENT_SUBJECTS.includes(subject as typeof ASSIGNMENT_SUBJECTS[number])) {
    return jsonError('教科を選択してください。', 400);
  }
  if (!title || title.length > 200) return jsonError('課題名は1〜200文字で入力してください。', 400);
  if (details.length > 5000) return jsonError('課題の内容は5000文字以内で入力してください。', 400);
  if (!targetClass) return jsonError('対象クラスを選択してください。', 400);
  if (!['paper', 'classroom', 'other'].includes(type)) return jsonError('課題の種類を選択してください。', 400);
  if (dueAt === undefined) return jsonError('提出期限を正しく指定してください。', 400);

  let subjectOption = '';
  if (targetClass === 'science') {
    if (subject === '物理') subjectOption = '物理選択者';
    else if (subject === '生物') subjectOption = '生物選択者';
    else if (subject === '数３') {
      if (!['アドバンスト', 'スタンダード'].includes(subjectOptionInput)) return jsonError('数３の選択区分を指定してください。', 400);
      subjectOption = subjectOptionInput;
    } else if (subject === '英コミュ') {
      if (!['Intensive', 'Standard'].includes(subjectOptionInput)) return jsonError('英コミュの選択区分を指定してください。', 400);
      subjectOption = subjectOptionInput;
    }
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data: session, error: sessionError } = await admin.from('line_assignment_sessions')
    .select('line_user_id,expires_at')
    .eq('form_token_hash', tokenHash)
    .maybeSingle();

  if (sessionError) {
    console.error('LINE assignment form session lookup failed:', sessionError.message);
    return jsonError('フォームを確認できませんでした。もう一度フォームを開いてください。', 503);
  }
  if (!session) return jsonError('このフォームはすでに使用されたか、無効になっています。公式アカウントから開き直してください。', 410);
  if (Date.parse(session.expires_at) <= Date.now()) {
    await admin.from('line_assignment_sessions').delete()
      .eq('line_user_id', session.line_user_id)
      .eq('form_token_hash', tokenHash);
    return jsonError('フォームの有効期限が切れました。公式アカウントから開き直してください。', 410);
  }

  const { error: insertError } = await admin.from('assignment_suggestions').insert({
    line_user_id: session.line_user_id,
    title,
    details,
    subject,
    target_class: targetClass,
    subject_option: subjectOption,
    type,
    due_at: dueAt,
    status: 'pending',
  });

  if (insertError) {
    console.error('LINE assignment suggestion save failed:', insertError.message);
    return jsonError('課題を保存できませんでした。入力内容を確認して再度お試しください。', 500);
  }

  await admin.from('line_assignment_sessions').delete()
    .eq('line_user_id', session.line_user_id)
    .eq('form_token_hash', tokenHash);

  return NextResponse.json({
    ok: true,
    message: '課題提案を受け付けました。管理者の確認後にCampusSyncへ公開されます。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
