import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import {
  getWorkspaceStudentContext,
  isSameOrigin,
  noStoreHeaders,
  recordWorkspaceAudit,
} from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });
const categories = ['club','committee','event','project','study','research','volunteer','other'] as const;
const joins = ['invite_only','approval','open'] as const;

export async function GET(request: Request) {
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);

    const { data: memberships, error: membershipError } = await context.admin
      .from('workspace_members')
      .select('workspace_id,member_role')
      .eq('user_id', context.userId)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const { data: requests, error: requestError } = await context.admin
      .from('workspace_join_requests')
      .select('workspace_id,status')
      .eq('user_id', context.userId);
    if (requestError) throw requestError;

    const memberIds = (memberships || []).map((item) => item.workspace_id);
    const listedQuery = context.admin.from('workspaces')
      .select('id,name,slug,category,description,visibility,join_mode,is_official,status,owner_user_id,created_at')
      .eq('status', 'active')
      .eq('visibility', 'listed')
      .order('created_at', { ascending: false })
      .limit(150);
    const { data: listed, error: listedError } = await listedQuery;
    if (listedError) throw listedError;

    let own: typeof listed = [];
    if (memberIds.length) {
      const { data, error } = await context.admin.from('workspaces')
        .select('id,name,slug,category,description,visibility,join_mode,is_official,status,owner_user_id,created_at')
        .eq('status', 'active')
        .in('id', memberIds);
      if (error) throw error;
      own = data || [];
    }

    const combined = new Map<string, NonNullable<typeof listed>[number]>();
    for (const workspace of [...(listed || []), ...(own || [])]) combined.set(workspace.id, workspace);
    const ids = [...combined.keys()];
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: memberRows, error } = await context.admin.from('workspace_members')
        .select('workspace_id')
        .eq('status', 'active')
        .in('workspace_id', ids);
      if (error) throw error;
      for (const row of memberRows || []) counts[row.workspace_id] = (counts[row.workspace_id] || 0) + 1;
    }

    const roleMap = new Map((memberships || []).map((item) => [item.workspace_id, item.member_role]));
    const requestMap = new Map((requests || []).map((item) => [item.workspace_id, item.status]));
    const workspaces = [...combined.values()].map((item) => ({
      ...item,
      member_count: counts[item.id] || 0,
      my_role: roleMap.get(item.id) || null,
      request_status: requestMap.get(item.id) || null,
    }));
    return NextResponse.json({ success: true, workspaces }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace list failed:', error);
    return fail('共有ワークスペース一覧を取得できませんでした。', 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail('不正な送信です。', 403);
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return fail('入力内容を読み取れません。');

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const category = String(body.category || 'other');
    const visibility = String(body.visibility || 'listed');
    const joinMode = String(body.join_mode || 'approval');
    if (name.length < 2 || name.length > 60) return fail('グループ名は2〜60文字で入力してください。');
    if (description.length > 800) return fail('説明は800文字以内にしてください。');
    if (!categories.includes(category as typeof categories[number])) return fail('グループの種類が正しくありません。');
    if (!['listed','unlisted'].includes(visibility)) return fail('公開範囲が正しくありません。');
    if (!joins.includes(joinMode as typeof joins[number])) return fail('参加方法が正しくありません。');

    const slugBase = name.toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'workspace';
    const slug = slugBase + '-' + randomBytes(4).toString('hex');
    const { data: workspace, error: createError } = await context.admin.from('workspaces').insert({
      name,
      slug,
      category,
      description,
      visibility,
      join_mode: joinMode,
      owner_user_id: context.userId,
      created_by: context.userId,
      is_official: false,
      status: 'active',
    }).select('id,name,slug,category,description,visibility,join_mode,is_official,status,owner_user_id,created_at').single();
    if (createError || !workspace) throw createError || new Error('workspace creation returned no row');

    const { error: memberError } = await context.admin.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: context.userId,
      student_id: context.studentId,
      display_name: context.displayName,
      user_class: context.userClass,
      member_role: 'owner',
      status: 'active',
    });
    if (memberError) {
      await context.admin.from('workspaces').delete().eq('id', workspace.id);
      throw memberError;
    }

    await recordWorkspaceAudit(context.admin, {
      workspaceId: workspace.id,
      actorUserId: context.userId,
      action: 'workspace_created',
      targetType: 'workspace',
      targetId: workspace.id,
      details: { category, visibility, join_mode: joinMode },
    });
    return NextResponse.json({ success: true, workspace: { ...workspace, member_count: 1, my_role: 'owner' } }, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    console.error('Workspace create failed:', error);
    return fail('グループを作成できませんでした。入力内容とアカウント状態を確認してください。', 500);
  }
}
