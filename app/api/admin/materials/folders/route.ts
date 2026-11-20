import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: noStore });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function authorized(request: Request): boolean {
  return verifyAdminSessionRequest(request);
}

export async function GET(request: Request) {
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);
  const { data, error } = await admin.from('study_material_folders')
    .select('id,name,parent_id,sort_order,created_at,updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) return fail('フォルダー一覧を取得できませんでした。', 500);
  return NextResponse.json({ success: true, folders: data || [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { name?: unknown; parent_id?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const parentId = typeof body?.parent_id === 'string' ? body.parent_id : null;
  if (!name || name.length > 80) return fail('フォルダー名は1〜80文字で入力してください。');
  if (parentId && !UUID_PATTERN.test(parentId)) return fail('親フォルダーが正しくありません。');
  if (parentId) {
    const { data: parent, error } = await admin.from('study_material_folders').select('id').eq('id', parentId).maybeSingle();
    if (error || !parent) return fail('親フォルダーが見つかりません。', error ? 500 : 404);
  }

  const { data, error } = await admin.from('study_material_folders').insert({
    name,
    parent_id: parentId,
    updated_at: new Date().toISOString(),
  }).select('id,name,parent_id,sort_order,created_at,updated_at').single();
  if (error || !data) {
    if (error?.code === '23505') return fail('同じ場所に同じ名前のフォルダーがあります。', 409);
    console.error('Study material folder create failed:', error?.message);
    return fail('フォルダーを作成できませんでした。', 500);
  }
  return NextResponse.json({ success: true, folder: data }, { status: 201, headers: noStore });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!UUID_PATTERN.test(id) || !name || name.length > 80) return fail('フォルダー名は1〜80文字で入力してください。');

  const { data, error } = await admin.from('study_material_folders').update({
    name,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id,name,parent_id,sort_order,updated_at').maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') return fail('同じ場所に同じ名前のフォルダーがあります。', 409);
    return fail('フォルダー名を変更できませんでした。', error ? 500 : 404);
  }
  return NextResponse.json({ success: true, folder: data }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!UUID_PATTERN.test(id)) return fail('削除対象のフォルダーIDが正しくありません。');

  const [{ count: childCount, error: childError }, { count: materialCount, error: materialError }] = await Promise.all([
    admin.from('study_material_folders').select('id', { count: 'exact', head: true }).eq('parent_id', id),
    admin.from('study_materials').select('id', { count: 'exact', head: true }).eq('folder_id', id).is('archived_at', null),
  ]);
  if (childError || materialError) return fail('フォルダーの中身を確認できませんでした。', 500);
  if ((childCount || 0) > 0 || (materialCount || 0) > 0) {
    return fail('中にサブフォルダーまたは資料があるため削除できません。先に中身を移動してください。', 409);
  }

  const { error } = await admin.from('study_material_folders').delete().eq('id', id);
  if (error) return fail('フォルダーを削除できませんでした。', 500);
  return NextResponse.json({ success: true }, { headers: noStore });
}
