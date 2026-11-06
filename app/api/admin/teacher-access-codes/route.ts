import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import {
  createTeacherAccessCode,
  getTeacherAccessAdmin,
  hashTeacherSecret,
  isValidDateKey,
  normalizeTeacherAccessCode,
} from '@/lib/teacher-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };
function unauthorized() {
  return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401, headers: noStore });
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return unauthorized();
  const admin = getTeacherAccessAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503, headers: noStore });

  const { data, error } = await admin
    .from('teacher_access_codes')
    .select('id,display_name,starts_on,ends_on,is_active,use_count,created_at,last_used_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('先生用アクセスコード一覧の取得に失敗:', error.message);
    return NextResponse.json({ success: false, message: '先生用アクセスコードを読み込めませんでした。' }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ success: true, codes: data || [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!verifyAdminSessionRequest(request)) return unauthorized();
  if (!request.headers.get('origin') || new URL(request.headers.get('origin')!).origin !== new URL(request.url).origin) {
    return NextResponse.json({ success: false, message: '不正な要求です。' }, { status: 403, headers: noStore });
  }
  const admin = getTeacherAccessAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503, headers: noStore });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ success: false, message: '入力内容を確認してください。' }, { status: 400, headers: noStore });

  const rawCode = createTeacherAccessCode();
  const codeHash = hashTeacherSecret(normalizeTeacherAccessCode(rawCode));
  if (body.action === 'rotate') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ success: false, message: '対象コードを確認できません。' }, { status: 400, headers: noStore });
    const { data: existing, error: findError } = await admin
      .from('teacher_access_codes')
      .select('id,session_generation')
      .eq('id', id)
      .maybeSingle();
    if (findError || !existing) return NextResponse.json({ success: false, message: '対象コードが見つかりません。' }, { status: 404, headers: noStore });

    const { error } = await admin.from('teacher_access_codes').update({ code_hash: codeHash, session_generation: (Number(existing.session_generation) || 1) + 1 }).eq('id', id);
    if (error) {
      console.error('先生用アクセスコード再発行に失敗:', error.message);
      return NextResponse.json({ success: false, message: 'コードを再発行できませんでした。' }, { status: 500, headers: noStore });
    }
    await admin.from('teacher_access_sessions').delete().eq('access_code_id', id);
    return NextResponse.json({ success: true, code: rawCode, message: '新しいコードを発行しました。以前のコードとログイン中のセッションは無効になりました。' }, { headers: noStore });
  }

  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const startsOn = body.starts_on;
  const endsOn = body.ends_on;
  if (!displayName || displayName.length > 80 || !isValidDateKey(startsOn) || !isValidDateKey(endsOn) || startsOn > endsOn) {
    return NextResponse.json({ success: false, message: '氏名・開始日・終了日を正しく入力してください。' }, { status: 400, headers: noStore });
  }

  const { data, error } = await admin.from('teacher_access_codes').insert({
    display_name: displayName,
    code_hash: codeHash,
    starts_on: startsOn,
    ends_on: endsOn,
    is_active: true,
  }).select('id,display_name,starts_on,ends_on,is_active,use_count,created_at,last_used_at').single();
  if (error || !data) {
    console.error('先生用アクセスコードの発行に失敗:', error?.message);
    return NextResponse.json({ success: false, message: 'アクセスコードを発行できませんでした。' }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ success: true, code: rawCode, item: data }, { headers: noStore });
}

export async function PATCH(request: Request) {
  if (!verifyAdminSessionRequest(request)) return unauthorized();
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ success: false, message: '不正な要求です。' }, { status: 403, headers: noStore });
  }
  const admin = getTeacherAccessAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ success: false, message: '対象コードを確認できません。' }, { status: 400, headers: noStore });

  const update: Record<string, unknown> = {};
  if (typeof body?.is_active === 'boolean') update.is_active = body.is_active;
  if (typeof body?.display_name === 'string') {
    const name = body.display_name.trim();
    if (!name || name.length > 80) return NextResponse.json({ success: false, message: '表示名は1〜80文字で入力してください。' }, { status: 400, headers: noStore });
    update.display_name = name;
  }
  if (body && 'starts_on' in body) {
    if (!isValidDateKey(body.starts_on)) return NextResponse.json({ success: false, message: '開始日が正しくありません。' }, { status: 400, headers: noStore });
    update.starts_on = body.starts_on;
  }
  if (body && 'ends_on' in body) {
    if (!isValidDateKey(body.ends_on)) return NextResponse.json({ success: false, message: '終了日が正しくありません。' }, { status: 400, headers: noStore });
    update.ends_on = body.ends_on;
  }
  if (!Object.keys(update).length) return NextResponse.json({ success: false, message: '変更内容がありません。' }, { status: 400, headers: noStore });

  const revokesExistingSessions = update.is_active === false || Boolean(update.starts_on || update.ends_on);
  let currentCode: { starts_on: string; ends_on: string; session_generation: number } | null = null;
  if (revokesExistingSessions || update.starts_on || update.ends_on) {
    const { data: current } = await admin.from('teacher_access_codes')
      .select('starts_on,ends_on,session_generation')
      .eq('id', id)
      .maybeSingle();
    if (!current) return NextResponse.json({ success: false, message: '対象コードが見つかりません。' }, { status: 404, headers: noStore });
    currentCode = current;
    const start = String(update.starts_on || current.starts_on);
    const end = String(update.ends_on || current.ends_on);
    if (start > end) return NextResponse.json({ success: false, message: '終了日は開始日以降にしてください。' }, { status: 400, headers: noStore });
  }
  if (revokesExistingSessions && currentCode) {
    update.session_generation = (Number(currentCode.session_generation) || 1) + 1;
  }

  const { data, error } = await admin.from('teacher_access_codes')
    .update(update)
    .eq('id', id)
    .select('id,display_name,starts_on,ends_on,is_active,use_count,created_at,last_used_at')
    .maybeSingle();
  if (error || !data) {
    console.error('先生用アクセスコードの更新に失敗:', error?.message);
    return NextResponse.json({ success: false, message: '変更を保存できませんでした。' }, { status: 500, headers: noStore });
  }
  if (update.is_active === false || update.starts_on || update.ends_on) {
    await admin.from('teacher_access_sessions').delete().eq('access_code_id', id);
  }
  return NextResponse.json({ success: true, item: data }, { headers: noStore });
}
