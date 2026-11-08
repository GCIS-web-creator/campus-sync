import { NextResponse } from 'next/server';
import { getWorkspaceMemberRole, getWorkspaceStudentContext, isSameOrigin, noStoreHeaders, recordWorkspaceAudit, workspaceIdPattern } from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const managers = ['owner', 'admin', 'editor'];
const statuses = ['todo', 'in_progress', 'review', 'done'];
const priorities = ['low', 'normal', 'high', 'urgent'];
const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const date = (v: unknown) => {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const ids = (v: unknown): string[] | null => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > 40 || v.some((x) => typeof x !== 'string' || !uuid.test(x))) return null;
  return [...new Set(v as string[])];
};
async function accessFor(request: Request, workspaceId: string) {
  const context = await getWorkspaceStudentContext(request);
  if (!context) return { response: fail('学校アカウントでログインしてください。', 401) } as const;
  const role = await getWorkspaceMemberRole(context.admin, workspaceId, context.userId);
  if (!role) return { response: fail('このグループのメンバーではありません。', 403) } as const;
  return { context, role } as const;
}
const audit = (admin: any, workspaceId: string, userId: string, action: string, kind: string, id: string) =>
  recordWorkspaceAudit(admin, { workspaceId, actorUserId: userId, action, targetType: kind, targetId: id });

export async function GET(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  try {
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const access = await accessFor(request, workspaceId);
    if ('response' in access) return access.response;
    const { context, role } = access;
    const db = context.admin;
    const [ev, ts, ms, mem] = await Promise.all([
      db.from('workspace_events').select('id,title,description,starts_at,ends_at,location,created_by,created_at,updated_at')
        .eq('workspace_id', workspaceId).is('canceled_at', null).order('starts_at', { ascending: true }).limit(300),
      db.from('workspace_tasks').select('id,title,description,status,priority,due_at,created_by,created_at,updated_at,completed_at,attachment_file_id')
        .eq('workspace_id', workspaceId).is('deleted_at', null).order('created_at', { ascending: false }).limit(250),
      db.from('workspace_minutes').select('id,title,meeting_at,attendees,agenda,discussion,decisions,action_items,author_user_id,created_at,updated_at')
        .eq('workspace_id', workspaceId).is('deleted_at', null).order('meeting_at', { ascending: false }).limit(100),
      db.from('workspace_members').select('user_id,display_name,user_class,member_role').eq('workspace_id', workspaceId).eq('status', 'active'),
    ]);
    for (const result of [ev, ts, ms, mem]) if (result.error) throw result.error;
    const memberMap = new Map((mem.data || []).map((m) => [m.user_id, m]));
    const eventIds = (ev.data || []).map((e) => e.id);
    const eventRsvps = eventIds.length
      ? await db.from('workspace_event_rsvps').select('event_id,user_id,response').in('event_id', eventIds)
      : { data: [], error: null };
    if (eventRsvps.error) throw eventRsvps.error;
    const rsvpMap = new Map<string, { attending: number; maybe: number; not_attending: number; mine: string | null }>();
    for (const item of eventRsvps.data || []) {
      const itemCount = rsvpMap.get(item.event_id) || { attending: 0, maybe: 0, not_attending: 0, mine: null };
      if (item.response === 'attending') itemCount.attending++;
      if (item.response === 'maybe') itemCount.maybe++;
      if (item.response === 'not_attending') itemCount.not_attending++;
      if (item.user_id === context.userId) itemCount.mine = item.response;
      rsvpMap.set(item.event_id, itemCount);
    }
    const taskIds = (ts.data || []).map((t) => t.id);
    const [ass, com] = taskIds.length ? await Promise.all([
      db.from('workspace_task_assignees').select('task_id,user_id').in('task_id', taskIds),
      db.from('workspace_task_comments').select('id,task_id,author_user_id,body,created_at,edited_at')
        .in('task_id', taskIds).is('deleted_at', null).order('created_at', { ascending: true }).limit(500),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (ass.error) throw ass.error;
    if (com.error) throw com.error;
    const fileIds = [...new Set((ts.data || []).map((t) => t.attachment_file_id).filter(Boolean))] as string[];
    const fileRows = fileIds.length
      ? await db.from('workspace_files').select('id,file_name,mime_type,file_size').eq('workspace_id', workspaceId).is('deleted_at', null).in('id', fileIds)
      : { data: [], error: null };
    if (fileRows.error) throw fileRows.error;
    const fileMap = new Map((fileRows.data || []).map((f) => [f.id, f]));
    const assigned = new Map<string, string[]>();
    for (const a of ass.data || []) assigned.set(a.task_id, [...(assigned.get(a.task_id) || []), a.user_id]);
    const comments = new Map<string, any[]>();
    for (const c of com.data || []) comments.set(c.task_id, [...(comments.get(c.task_id) || []), {
      id: c.id, body: c.body, created_at: c.created_at, edited_at: c.edited_at,
      author_name: memberMap.get(c.author_user_id)?.display_name || 'メンバー',
      is_mine: c.author_user_id === context.userId,
    }]);
    return NextResponse.json({
      success: true, role,
      events: (ev.data || []).map((e) => ({ ...e, creator_name: memberMap.get(e.created_by)?.display_name || 'メンバー',
        rsvps: rsvpMap.get(e.id) || { attending: 0, maybe: 0, not_attending: 0, mine: null } })),
      tasks: (ts.data || []).map((t) => {
        const assignedIds = assigned.get(t.id) || [];
        return { ...t, creator_name: memberMap.get(t.created_by)?.display_name || 'メンバー',
          assignee_ids: assignedIds, assignees: assignedIds.map((id) => ({ user_id: id, display_name: memberMap.get(id)?.display_name || 'メンバー' })),
          attachment: t.attachment_file_id ? fileMap.get(t.attachment_file_id) || null : null,
          comments: comments.get(t.id) || [],
          can_update_status: t.created_by === context.userId || assignedIds.includes(context.userId) };
      }),
      minutes: (ms.data || []).map((m) => ({ ...m, author_name: memberMap.get(m.author_user_id)?.display_name || 'メンバー', is_mine: m.author_user_id === context.userId })),
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace planning read failed:', error);
    return fail('カレンダー・タスク・議事録を取得できませんでした。', 500);
  }
}

export async function POST(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な送信です。', 403);
  try {
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const access = await accessFor(request, workspaceId);
    if ('response' in access) return access.response;
    const { context, role } = access;
    const db = context.admin;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return fail('送信内容を確認してください。');

    if (body.action === 'rsvp') {
      const eventId = typeof body.event_id === 'string' ? body.event_id : '';
      const response = typeof body.response === 'string' ? body.response : '';
      if (!uuid.test(eventId) || !['attending', 'maybe', 'not_attending'].includes(response)) return fail('出欠回答が正しくありません。');
      const { data: event, error } = await db.from('workspace_events').select('id').eq('id', eventId).eq('workspace_id', workspaceId).is('canceled_at', null).maybeSingle();
      if (error) throw error;
      if (!event) return fail('予定が見つかりません。', 404);
      const { error: upsertError } = await db.from('workspace_event_rsvps').upsert({ event_id: eventId, user_id: context.userId, response, updated_at: new Date().toISOString() }, { onConflict: 'event_id,user_id' });
      if (upsertError) throw upsertError;
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    if (body.action === 'task_status') {
      const taskId = typeof body.task_id === 'string' ? body.task_id : '';
      const status = typeof body.status === 'string' ? body.status : '';
      if (!uuid.test(taskId) || !statuses.includes(status)) return fail('タスクの状態が正しくありません。');
      const { data: task, error } = await db.from('workspace_tasks').select('id,created_by').eq('id', taskId).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!task) return fail('タスクが見つかりません。', 404);
      const { data: assigned, error: aError } = await db.from('workspace_task_assignees').select('id').eq('task_id', taskId).eq('user_id', context.userId).maybeSingle();
      if (aError) throw aError;
      if (task.created_by !== context.userId && !assigned) return fail('このタスクの状態を変更する権限がありません。', 403);
      const now = new Date().toISOString();
      const { error: updateError } = await db.from('workspace_tasks').update({ status, completed_at: status === 'done' ? now : null, updated_at: now }).eq('id', taskId).eq('workspace_id', workspaceId);
      if (updateError) throw updateError;
      await audit(db, workspaceId, context.userId, 'task_status_changed', 'task', taskId);
      return NextResponse.json({ success: true }, { headers: noStoreHeaders });
    }

    if (body.action === 'task_comment') {
      const taskId = typeof body.task_id === 'string' ? body.task_id : '';
      const content = text(body.body, 3000);
      if (!uuid.test(taskId) || !content) return fail('コメントを入力してください。');
      const { data: task, error } = await db.from('workspace_tasks').select('id').eq('id', taskId).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!task) return fail('タスクが見つかりません。', 404);
      const { data, error: insertError } = await db.from('workspace_task_comments').insert({ task_id: taskId, author_user_id: context.userId, body: content }).select('id,body,created_at').single();
      if (insertError) throw insertError;
      await audit(db, workspaceId, context.userId, 'task_comment_created', 'task', taskId);
      return NextResponse.json({ success: true, comment: { ...data, author_name: context.displayName, is_mine: true } }, { status: 201, headers: noStoreHeaders });
    }

    if (!managers.includes(role)) return fail('作成する権限がありません。', 403);
    if (body.kind === 'event') {
      const title = text(body.title, 160);
      const starts = date(body.starts_at);
      const ends = body.ends_at ? date(body.ends_at) : null;
      if (!title || !starts || (body.ends_at && !ends) || (ends && new Date(ends) < new Date(starts))) return fail('予定名と正しい開始・終了日時を入力してください。');
      const { data, error } = await db.from('workspace_events').insert({
        workspace_id: workspaceId, created_by: context.userId, title, description: text(body.description, 5000),
        starts_at: starts, ends_at: ends, location: text(body.location, 240),
      }).select('id,title,description,starts_at,ends_at,location').single();
      if (error) throw error;
      await audit(db, workspaceId, context.userId, 'event_created', 'event', data.id);
      return NextResponse.json({ success: true, event: data }, { status: 201, headers: noStoreHeaders });
    }

    if (body.kind === 'task') {
      const title = text(body.title, 200);
      const dueAt = body.due_at ? date(body.due_at) : null;
      const priority = typeof body.priority === 'string' ? body.priority : 'normal';
      const assigneeIds = ids(body.assignee_ids);
      const fileId = body.attachment_file_id || null;
      if (!title || !priorities.includes(priority) || (body.due_at && !dueAt) || !assigneeIds || (fileId && (typeof fileId !== 'string' || !uuid.test(fileId)))) return fail('タスクの入力内容を確認してください。');
      if (assigneeIds.length) {
        const { data, error } = await db.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('status', 'active').in('user_id', assigneeIds);
        if (error) throw error;
        if ((data || []).length !== assigneeIds.length) return fail('担当者にグループ外のユーザーが含まれています。', 403);
      }
      if (fileId) {
        const { data, error } = await db.from('workspace_files').select('id').eq('id', fileId).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
        if (error) throw error;
        if (!data) return fail('添付ファイルが見つかりません。', 404);
      }
      const { data, error } = await db.from('workspace_tasks').insert({
        workspace_id: workspaceId, created_by: context.userId, title, description: text(body.description, 5000),
        priority, due_at: dueAt, status: 'todo', attachment_file_id: fileId,
      }).select('id').single();
      if (error) throw error;
      if (assigneeIds.length) {
        const { error: assignmentError } = await db.from('workspace_task_assignees').insert(assigneeIds.map((id) => ({ task_id: data.id, user_id: id, assigned_by: context.userId })));
        if (assignmentError) { await db.from('workspace_tasks').update({ deleted_at: new Date().toISOString() }).eq('id', data.id); throw assignmentError; }
      }
      await audit(db, workspaceId, context.userId, 'task_created', 'task', data.id);
      return NextResponse.json({ success: true, task: data }, { status: 201, headers: noStoreHeaders });
    }

    if (body.kind === 'minute') {
      const title = text(body.title, 160);
      const meetingAt = date(body.meeting_at);
      const attendees = Array.isArray(body.attendees) ? body.attendees.filter((v): v is string => typeof v === 'string').map((v) => v.trim().slice(0, 80)).filter(Boolean).slice(0, 100) : [];
      const actionItems = Array.isArray(body.action_items) && body.action_items.length <= 100 && body.action_items.every((v) => typeof v === 'string' && v.trim().length <= 300) ? body.action_items.map((v) => String(v).trim()).filter(Boolean) : null;
      if (!title || !meetingAt || !actionItems) return fail('議事録の必須項目を確認してください。');
      const { data, error } = await db.from('workspace_minutes').insert({
        workspace_id: workspaceId, author_user_id: context.userId, title, meeting_at: meetingAt, attendees,
        agenda: text(body.agenda, 5000), discussion: text(body.discussion, 12000), decisions: text(body.decisions, 8000), action_items: actionItems,
      }).select('id').single();
      if (error) throw error;
      await audit(db, workspaceId, context.userId, 'minute_created', 'minute', data.id);
      return NextResponse.json({ success: true, minute: data }, { status: 201, headers: noStoreHeaders });
    }
    return fail('操作内容が正しくありません。');
  } catch (error) {
    console.error('Workspace planning create failed:', error);
    return fail('保存できませんでした。入力内容と権限を確認してください。', 500);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const access = await accessFor(request, workspaceId);
    if ('response' in access) return access.response;
    const { context, role } = access;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.id !== 'string' || !uuid.test(body.id)) return fail('対象IDが正しくありません。');
    const db = context.admin;
    if (!managers.includes(role) && body.kind !== 'minute') return fail('編集する権限がありません。', 403);

    if (body.kind === 'event') {
      const title = text(body.title, 160);
      const starts = date(body.starts_at);
      const ends = body.ends_at ? date(body.ends_at) : null;
      if (!title || !starts || (body.ends_at && !ends) || (ends && new Date(ends) < new Date(starts))) return fail('予定名と正しい開始・終了日時を入力してください。');
      const { data, error } = await db.from('workspace_events').update({
        title, description: text(body.description, 5000), starts_at: starts, ends_at: ends,
        location: text(body.location, 240), updated_at: new Date().toISOString(),
      }).eq('id', body.id).eq('workspace_id', workspaceId).is('canceled_at', null).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return fail('予定が見つかりません。', 404);
    } else if (body.kind === 'task') {
      const title = text(body.title, 200);
      const dueAt = body.due_at ? date(body.due_at) : null;
      const priority = typeof body.priority === 'string' ? body.priority : 'normal';
      const assigneeIds = ids(body.assignee_ids);
      const fileId = body.attachment_file_id || null;
      if (!title || !priorities.includes(priority) || (body.due_at && !dueAt) || !assigneeIds || (fileId && (typeof fileId !== 'string' || !uuid.test(fileId)))) return fail('タスクの入力内容を確認してください。');
      const { data: task, error } = await db.from('workspace_tasks').select('id').eq('id', body.id).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
      if (error) throw error;
      if (!task) return fail('タスクが見つかりません。', 404);
      if (assigneeIds.length) {
        const { data, error: memberError } = await db.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('status', 'active').in('user_id', assigneeIds);
        if (memberError) throw memberError;
        if ((data || []).length !== assigneeIds.length) return fail('担当者にグループ外のユーザーが含まれています。', 403);
      }
      if (fileId) {
        const { data, error: fileError } = await db.from('workspace_files').select('id').eq('id', fileId).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
        if (fileError) throw fileError;
        if (!data) return fail('添付ファイルが見つかりません。', 404);
      }
      const { error: updateError } = await db.from('workspace_tasks').update({
        title, description: text(body.description, 5000), due_at: dueAt, priority, attachment_file_id: fileId, updated_at: new Date().toISOString(),
      }).eq('id', body.id).eq('workspace_id', workspaceId);
      if (updateError) throw updateError;
      const { error: clearError } = await db.from('workspace_task_assignees').delete().eq('task_id', body.id);
      if (clearError) throw clearError;
      if (assigneeIds.length) {
        const { error: assignError } = await db.from('workspace_task_assignees').insert(assigneeIds.map((id) => ({ task_id: body.id as string, user_id: id, assigned_by: context.userId })));
        if (assignError) throw assignError;
      }
    } else if (body.kind === 'minute') {
      const { data: minute, error: lookupError } = await db.from('workspace_minutes').select('id,author_user_id').eq('id', body.id).eq('workspace_id', workspaceId).is('deleted_at', null).maybeSingle();
      if (lookupError) throw lookupError;
      if (!minute) return fail('議事録が見つかりません。', 404);
      if (minute.author_user_id !== context.userId && !managers.includes(role)) return fail('この議事録を編集する権限がありません。', 403);
      const title = text(body.title, 160);
      const meetingAt = date(body.meeting_at);
      const actionItems = Array.isArray(body.action_items) && body.action_items.length <= 100 && body.action_items.every((v) => typeof v === 'string' && v.trim().length <= 300) ? body.action_items.map((v) => String(v).trim()).filter(Boolean) : null;
      if (!title || !meetingAt || !actionItems) return fail('議事録の必須項目を確認してください。');
      const attendees = Array.isArray(body.attendees) ? body.attendees.filter((v): v is string => typeof v === 'string').map((v) => v.trim().slice(0, 80)).filter(Boolean).slice(0, 100) : [];
      const { error } = await db.from('workspace_minutes').update({
        title, meeting_at: meetingAt, attendees, agenda: text(body.agenda, 5000),
        discussion: text(body.discussion, 12000), decisions: text(body.decisions, 8000),
        action_items: actionItems, updated_at: new Date().toISOString(),
      }).eq('id', body.id).eq('workspace_id', workspaceId);
      if (error) throw error;
    } else return fail('操作内容が正しくありません。');

    await audit(db, workspaceId, context.userId, String(body.kind) + '_updated', String(body.kind), body.id);
    return NextResponse.json({ success: true }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace planning update failed:', error);
    return fail('更新できませんでした。入力内容を確認してください。', 500);
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な操作です。', 403);
  try {
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const access = await accessFor(request, workspaceId);
    if ('response' in access) return access.response;
    const { context, role } = access;
    if (!managers.includes(role)) return fail('削除する権限がありません。', 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.id !== 'string' || !uuid.test(body.id) || !['event', 'task', 'minute'].includes(String(body.kind))) return fail('削除対象が正しくありません。');
    const now = new Date().toISOString();
    const column = body.kind === 'event' ? 'canceled_at' : 'deleted_at';
    const { data, error } = await context.admin.from(body.kind === 'event' ? 'workspace_events' : body.kind === 'task' ? 'workspace_tasks' : 'workspace_minutes')
      .update({ [column]: now, updated_at: now }).eq('id', body.id).eq('workspace_id', workspaceId).is(column, null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return fail('対象が見つかりません。', 404);
    await audit(context.admin, workspaceId, context.userId, String(body.kind) + '_deleted', String(body.kind), body.id);
    return NextResponse.json({ success: true }, { headers: noStoreHeaders });
  } catch (error) {
    console.error('Workspace planning delete failed:', error);
    return fail('削除できませんでした。', 500);
  }
}
