import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient } from '@/lib/study-materials-server';
import { noStoreHeaders } from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);
  const { data: workspaces, error } = await admin.from('workspaces')
    .select('id,name,slug,category,description,visibility,join_mode,is_official,status,owner_user_id,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return fail('ワークスペース一覧を取得できませんでした。', 500);
  const ids = (workspaces || []).map((item) => item.id);
  const counts: Record<string, number> = {};
  if (ids.length) {
    const { data, error: countError } = await admin.from('workspace_members')
      .select('workspace_id')
      .eq('status', 'active')
      .in('workspace_id', ids);
    if (countError) return fail('メンバー数を取得できませんでした。', 500);
    for (const row of data || []) counts[row.workspace_id] = (counts[row.workspace_id] || 0) + 1;
  }
  return NextResponse.json({
    success: true,
    workspaces: (workspaces || []).map((item) => ({ ...item, member_count: counts[item.id] || 0 })),
  }, { headers: noStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な操作です。', 403);
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown; value?: unknown } | null;
  if (typeof body?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id)) return fail('グループIDが正しくありません。');
  const now = new Date().toISOString();
  let changes: Record<string, unknown>;
  let action: string;
  if (body.action === 'official' && typeof body.value === 'boolean') {
    changes = { is_official: body.value, updated_at: now };
    action = body.value ? 'admin_marked_official' : 'admin_removed_official_status';
  } else if (body.action === 'status' && ['active','suspended','archived'].includes(String(body.value))) {
    changes = {
      status: body.value,
      updated_at: now,
      archived_at: body.value === 'archived' ? now : null,
    };
    action = 'admin_changed_workspace_status';
  } else {
    return fail('変更内容が正しくありません。');
  }
  const { data, error } = await admin.from('workspaces').update(changes)
    .eq('id', body.id)
    .select('id,name,is_official,status,updated_at')
    .maybeSingle();
  if (error || !data) return fail('グループを更新できませんでした。', error ? 500 : 404);
  await admin.from('workspace_audit_logs').insert({
    workspace_id: body.id,
    actor_type: 'admin',
    action,
    target_type: 'workspace',
    target_id: body.id,
    details: { value: body.value },
  });
  return NextResponse.json({ success: true, workspace: data }, { headers: noStoreHeaders });
}
