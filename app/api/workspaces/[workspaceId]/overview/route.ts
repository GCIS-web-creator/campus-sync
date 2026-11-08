import { NextResponse } from 'next/server';
import { getWorkspaceMemberRole, getWorkspaceStudentContext, noStoreHeaders, workspaceIdPattern } from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });

export async function GET(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role = await getWorkspaceMemberRole(context.admin, workspaceId, context.userId);
    if (!role) return fail('このグループのメンバーではありません。', 403);

    const admin = context.admin;
    const now = new Date().toISOString();
    const [workspaceResult, memberCountResult, postCountResult, messageCountResult, fileCountResult, taskCountResult, eventCountResult, postsResult, messagesResult, filesResult, eventsResult, tasksResult] = await Promise.all([
      admin.from('workspaces').select('id,name,category,description,is_official,join_mode,visibility,owner_user_id').eq('id', workspaceId).single(),
      admin.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
      admin.from('workspace_posts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null),
      admin.from('workspace_messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null),
      admin.from('workspace_files').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null),
      admin.from('workspace_tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['todo','in_progress','review']).is('deleted_at', null),
      admin.from('workspace_events').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('starts_at', now).is('canceled_at', null),
      admin.from('workspace_posts').select('id,title,body,is_pinned,author_user_id,created_at').eq('workspace_id', workspaceId).is('deleted_at', null).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      admin.from('workspace_messages').select('id,body,sender_user_id,created_at').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
      admin.from('workspace_files').select('id,file_name,mime_type,file_size,folder_path,created_at,uploaded_by').eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
      admin.from('workspace_events').select('id,title,starts_at,ends_at,location').eq('workspace_id', workspaceId).gte('starts_at', now).is('canceled_at', null).order('starts_at', { ascending: true }).limit(4),
      admin.from('workspace_tasks').select('id,title,status,priority,due_at').eq('workspace_id', workspaceId).in('status', ['todo','in_progress','review']).is('deleted_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(4),
    ]);
    const errors = [workspaceResult.error, memberCountResult.error, postCountResult.error, messageCountResult.error, fileCountResult.error, taskCountResult.error, eventCountResult.error, postsResult.error, messagesResult.error, filesResult.error, eventsResult.error, tasksResult.error].filter(Boolean);
    if (errors.length) throw errors[0];
    const ids = new Set<string>();
    for (const row of [...(postsResult.data || []).map((item) => item.author_user_id), ...(messagesResult.data || []).map((item) => item.sender_user_id), ...(filesResult.data || []).map((item) => item.uploaded_by)]) ids.add(row);
    const names = new Map<string, string>();
    if (ids.size) {
      const { data: memberRows, error } = await admin.from('workspace_members')
        .select('user_id,display_name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .in('user_id', [...ids]);
      if (error) throw error;
      for (const member of memberRows || []) names.set(member.user_id, member.display_name);
    }

    return NextResponse.json({
      success: true,
      role,
      workspace: workspaceResult.data,
      counts: {
        members: memberCountResult.count || 0,
        posts: postCountResult.count || 0,
        messages: messageCountResult.count || 0,
        files: fileCountResult.count || 0,
        openTasks: taskCountResult.count || 0,
        upcomingEvents: eventCountResult.count || 0,
      },
      recentPosts: (postsResult.data || []).map((item) => ({ ...item, author_name: names.get(item.author_user_id) || 'メンバー' })),
      recentMessages: (messagesResult.data || []).map((item) => ({ ...item, sender_name: names.get(item.sender_user_id) || 'メンバー' })).reverse(),
      recentFiles: (filesResult.data || []).map((item) => ({ ...item, uploader_name: names.get(item.uploaded_by) || 'メンバー' })),
      upcomingEvents: eventsResult.data || [],
      openTasks: tasksResult.data || [],
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace overview failed:', error);
    return fail('ワークスペースのホーム情報を取得できませんでした。', 500);
  }
}
