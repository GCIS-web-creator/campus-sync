import { NextResponse } from 'next/server';
import {
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

export async function POST(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');

    const body = await request.json().catch(() => ({})) as { invite_code?: unknown; message?: unknown };
    const inviteCode = typeof body.invite_code === 'string' ? body.invite_code.trim().toUpperCase() : '';
    const message = typeof body.message === 'string' ? body.message.trim().slice(0,300) : '';
    const { data: workspace, error: workspaceError } = await context.admin.from('workspaces')
      .select('id,name,join_mode,status')
      .eq('id', workspaceId)
      .maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace || workspace.status !== 'active') return fail('このグループは現在参加できません。', 404);

    const { data: current, error: currentError } = await context.admin.from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', context.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (currentError) throw currentError;
    if (current) return NextResponse.json({ success: true, state: 'already_member', message: 'すでにメンバーです。' }, { headers: noStoreHeaders });

    if (inviteCode) {
      if (!/^[A-F0-9]{24,64}$/.test(inviteCode)) return fail('招待コードの形式が正しくありません。');
      const { data, error } = await context.admin.rpc('redeem_workspace_invite', {
        p_workspace_id: workspaceId,
        p_token_hash: hashWorkspaceInvite(inviteCode),
        p_user_id: context.userId,
        p_student_id: context.studentId,
        p_display_name: context.displayName,
        p_user_class: context.userClass,
      });
      if (error) {
        console.warn('Workspace invite redemption rejected:', error.message);
        return fail('招待コードが無効か、期限切れ・使用上限に達しています。', 403);
      }
      if (data === 'joined' || data === 'already_member') {
        await recordWorkspaceAudit(context.admin, {
          workspaceId,
          actorUserId: context.userId,
          action: 'workspace_joined_by_invite',
          targetType: 'member',
          details: { join_mode: workspace.join_mode },
        });
        return NextResponse.json({ success: true, state: data, message: 'グループに参加しました。' }, { headers: noStoreHeaders });
      }
      return fail('招待コードを利用できませんでした。', 403);
    }

    if (workspace.join_mode === 'invite_only') return fail('このグループは招待コードが必要です。', 403);
    if (workspace.join_mode === 'approval') {
      const { data, error } = await context.admin.from('workspace_join_requests').upsert({
        workspace_id: workspaceId,
        user_id: context.userId,
        student_id: context.studentId,
        display_name: context.displayName,
        user_class: context.userClass,
        message,
        status: 'pending',
        requested_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
      }, { onConflict: 'workspace_id,user_id' }).select('id,status').single();
      if (error) throw error;
      await recordWorkspaceAudit(context.admin, {
        workspaceId,
        actorUserId: context.userId,
        action: 'join_requested',
        targetType: 'join_request',
        targetId: data.id,
      });
      return NextResponse.json({ success: true, state: 'pending', message: '参加申請を送信しました。承認されると参加できます。' }, { headers: noStoreHeaders });
    }

    const { error: joinError } = await context.admin.from('workspace_members').upsert({
      workspace_id: workspaceId,
      user_id: context.userId,
      student_id: context.studentId,
      display_name: context.displayName,
      user_class: context.userClass,
      member_role: 'member',
      status: 'active',
      joined_at: new Date().toISOString(),
      removed_at: null,
    }, { onConflict: 'workspace_id,user_id' });
    if (joinError) throw joinError;
    await recordWorkspaceAudit(context.admin, {
      workspaceId,
      actorUserId: context.userId,
      action: 'workspace_joined_open',
      targetType: 'member',
    });
    return NextResponse.json({ success: true, state: 'joined', message: 'グループに参加しました。' }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace join failed:', error);
    return fail('グループへの参加処理に失敗しました。', 500);
  }
}
