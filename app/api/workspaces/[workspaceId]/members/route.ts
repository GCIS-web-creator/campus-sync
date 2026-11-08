import { NextResponse } from 'next/server';
import {
  createWorkspaceInviteCode,
  getWorkspaceMemberRole,
  getWorkspaceStudentContext,
  hashWorkspaceInvite,
  isSameOrigin,
  noStoreHeaders,
  recordWorkspaceAudit,
  workspaceIdPattern,
} from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });
const managerRoles = ['owner','admin'];

export async function GET(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role = await getWorkspaceMemberRole(context.admin, workspaceId, context.userId);
    if (!role) return fail('このグループのメンバーではありません。', 403);

    const { data: members, error } = await context.admin.from('workspace_members')
      .select('id,user_id,student_id,display_name,user_class,member_role,joined_at')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });
    if (error) throw error;

    let requests: unknown[] = [];
    if (managerRoles.includes(role)) {
      const { data, error: requestError } = await context.admin.from('workspace_join_requests')
        .select('id,user_id,student_id,display_name,user_class,message,requested_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (requestError) throw requestError;
      requests = data || [];
    }
    const { data: workspace, error: workspaceError } = await context.admin.from('workspaces')
      .select('id,name,owner_user_id,is_official,join_mode,visibility')
      .eq('id', workspaceId)
      .single();
    if (workspaceError) throw workspaceError;
    return NextResponse.json({ success: true, role, workspace, members: members || [], requests }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace member list failed:', error);
    return fail('メンバー情報を取得できませんでした。', 500);
  }
}

export async function POST(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role = await getWorkspaceMemberRole(context.admin, workspaceId, context.userId);
    if (!role || !managerRoles.includes(role)) return fail('招待コードを発行できる権限がありません。', 403);
    const body = await request.json().catch(() => ({})) as { expires_in_hours?: unknown; max_uses?: unknown };
    const hours = Number(body.expires_in_hours ?? 168);
    const maxUses = Number(body.max_uses ?? 5);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) return fail('有効時間は1〜720時間で指定してください。');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 50) return fail('使用回数は1〜50回で指定してください。');

    const code = createWorkspaceInviteCode();
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await context.admin.from('workspace_invites').insert({
      workspace_id: workspaceId,
      token_hash: hashWorkspaceInvite(code),
      created_by: context.userId,
      expires_at: expiresAt,
      max_uses: maxUses,
    }).select('id,expires_at,max_uses').single();
    if (error) throw error;
    await recordWorkspaceAudit(context.admin, {
      workspaceId,
      actorUserId: context.userId,
      action: 'invite_created',
      targetType: 'invite',
      targetId: data.id,
      details: { expires_at: expiresAt, max_uses: maxUses },
    });
    return NextResponse.json({ success: true, invite: { id: data.id, code, expires_at: data.expires_at, max_uses: data.max_uses } }, {
      status: 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    console.error('Workspace invite create failed:', error);
    return fail('招待コードを発行できませんでした。', 500);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const actorRole = await getWorkspaceMemberRole(context.admin, workspaceId, context.userId);
    if (!actorRole) return fail('このグループのメンバーではありません。', 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== 'string') return fail('操作内容が正しくありません。');

    if (body.action === 'approve_request' || body.action === 'reject_request') {
      if (!managerRoles.includes(actorRole)) return fail('参加申請を処理する権限がありません。', 403);
      const requestId = String(body.request_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return fail('申請IDが正しくありません。');
      const { data: joinRequest, error } = await context.admin.from('workspace_join_requests')
        .select('id,user_id,student_id,display_name,user_class,status')
        .eq('id', requestId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!joinRequest || joinRequest.status !== 'pending') return fail('この参加申請はすでに処理されています。', 409);
      const approved = body.action === 'approve_request';
      if (approved) {
        const { error: memberError } = await context.admin.from('workspace_members').upsert({
          workspace_id: workspaceId,
          user_id: joinRequest.user_id,
          student_id: joinRequest.student_id,
          display_name: joinRequest.display_name,
          user_class: joinRequest.user_class,
          member_role: 'member',
          status: 'active',
          joined_at: new Date().toISOString(),
          removed_at: null,
        }, { onConflict: 'workspace_id,user_id' });
        if (memberError) throw memberError;
      }
      const { error: updateError } = await context.admin.from('workspace_join_requests')
        .update({ status: approved ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
        .eq('id', requestId)
        .eq('status', 'pending');
      if (updateError) throw updateError;
      await recordWorkspaceAudit(context.admin, {
        workspaceId,
        actorUserId: context.userId,
        action: approved ? 'join_request_approved' : 'join_request_rejected',
        targetType: 'join_request',
        targetId: requestId,
      });
      return NextResponse.json({ success: true, message: approved ? '参加申請を承認しました。' : '参加申請を却下しました。' }, { headers: noStoreHeaders });
    }

    if (body.action === 'change_role') {
      if (actorRole !== 'owner') return fail('メンバー権限の変更はオーナーのみ行えます。', 403);
      const targetUserId = String(body.user_id || '');
      const newRole = String(body.member_role || '');
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || !['admin','editor','member'].includes(newRole)) return fail('変更内容が正しくありません。');
      const { data, error } = await context.admin.from('workspace_members')
        .update({ member_role: newRole })
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .eq('status', 'active')
        .neq('member_role', 'owner')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return fail('対象メンバーを更新できませんでした。', 404);
      await recordWorkspaceAudit(context.admin, {
        workspaceId,
        actorUserId: context.userId,
        action: 'member_role_changed',
        targetType: 'member',
        details: { target_user_id: targetUserId, member_role: newRole },
      });
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    if (body.action === 'remove_member') {
      if (!managerRoles.includes(actorRole)) return fail('メンバーを退出させる権限がありません。', 403);
      const targetUserId = String(body.user_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId) || targetUserId === context.userId) return fail('対象メンバーが正しくありません。');
      const { data: target, error } = await context.admin.from('workspace_members')
        .select('member_role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw error;
      if (!target || target.member_role === 'owner' || (actorRole === 'admin' && ['admin','adviser'].includes(target.member_role))) {
        return fail('このメンバーを退出させる権限がありません。', 403);
      }
      const { error: updateError } = await context.admin.from('workspace_members')
        .update({ status: 'removed', removed_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
        .eq('user_id', targetUserId)
        .eq('status', 'active');
      if (updateError) throw updateError;
      await recordWorkspaceAudit(context.admin, {
        workspaceId,
        actorUserId: context.userId,
        action: 'member_removed',
        targetType: 'member',
        details: { target_user_id: targetUserId },
      });
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    if (body.action === 'transfer_owner') {
      if (actorRole !== 'owner') return fail('オーナーの引き継ぎは現在のオーナーのみ行えます。', 403);
      const targetUserId = String(body.user_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) return fail('引き継ぎ先が正しくありません。');
      const { data, error } = await context.admin.rpc('transfer_workspace_owner', {
        p_workspace_id: workspaceId,
        p_actor_user_id: context.userId,
        p_target_user_id: targetUserId,
      });
      if (error || data !== true) {
        console.error('Workspace ownership transfer failed:', error?.message);
        return fail('オーナーを引き継げませんでした。', 409);
      }
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    if (body.action === 'revoke_invite') {
      if (!managerRoles.includes(actorRole)) return fail('招待コードを無効化する権限がありません。', 403);
      const inviteId = String(body.invite_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return fail('招待IDが正しくありません。');
      const { data, error } = await context.admin.from('workspace_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('workspace_id', workspaceId)
        .is('revoked_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return fail('招待コードを無効化できませんでした。', 404);
      await recordWorkspaceAudit(context.admin, {
        workspaceId,
        actorUserId: context.userId,
        action: 'invite_revoked',
        targetType: 'invite',
        targetId: inviteId,
      });
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    return fail('対応していない操作です。');
  } catch (error) {
    console.error('Workspace member action failed:', error);
    return fail('メンバー管理を更新できませんでした。', 500);
  }
}
