import { NextResponse } from 'next/server';
import { getWorkspaceMemberRole, getWorkspaceStudentContext, isSameOrigin, noStoreHeaders, recordWorkspaceAudit, workspaceIdPattern } from '@/lib/workspaces-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const fail = (message: string, status = 400) =>
  NextResponse.json({ success: false, message }, { status, headers: noStoreHeaders });
const canManage = (role: string) => ['owner','admin','editor'].includes(role);

async function loadPostAuthorNames(admin: NonNullable<Awaited<ReturnType<typeof getWorkspaceStudentContext>>>['admin'], workspaceId: string, ids: string[]) {
  const names = new Map<string,string>();
  if (!ids.length) return names;
  const { data, error } = await admin.from('workspace_members').select('user_id,display_name')
    .eq('workspace_id', workspaceId).eq('status','active').in('user_id',ids);
  if (error) throw error;
  for (const row of data || []) names.set(row.user_id,row.display_name);
  return names;
}

export async function GET(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。',401);
    const { workspaceId } = await route.params;
    if (!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role = await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if (!role) return fail('このグループのメンバーではありません。',403);
    const { data, error } = await context.admin.from('workspace_posts')
      .select('id,title,body,is_pinned,author_user_id,created_at,updated_at')
      .eq('workspace_id',workspaceId).is('deleted_at',null)
      .order('is_pinned',{ascending:false}).order('created_at',{ascending:false}).limit(100);
    if (error) throw error;
    const names = await loadPostAuthorNames(context.admin,workspaceId,[...new Set((data||[]).map((item)=>item.author_user_id))]);
    return NextResponse.json({success:true,role,posts:(data||[]).map((item)=>({...item,author_name:names.get(item.author_user_id)||'メンバー',is_mine:item.author_user_id===context.userId}))},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace posts read failed:',error);
    return fail('投稿を取得できませんでした。',500);
  }
}

export async function POST(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if (!isSameOrigin(request)) return fail('不正な送信です。',403);
  try {
    const context = await getWorkspaceStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role||!canManage(role)) return fail('お知らせを投稿する権限がありません。',403);
    const body=await request.json().catch(()=>null) as {title?:unknown;body?:unknown}|null;
    const title=typeof body?.title==='string'?body.title.trim():'';
    const content=typeof body?.body==='string'?body.body.trim():'';
    if(title.length<1||title.length>160) return fail('タイトルは1〜160文字で入力してください。');
    if(content.length>10000) return fail('本文は10,000文字以内にしてください。');
    const {data,error}=await context.admin.from('workspace_posts').insert({
      workspace_id:workspaceId,author_user_id:context.userId,title,body:content,
    }).select('id,title,body,is_pinned,author_user_id,created_at,updated_at').single();
    if(error) throw error;
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'post_created',targetType:'post',targetId:data.id});
    return NextResponse.json({success:true,post:{...data,author_name:context.displayName,is_mine:true}},{status:201,headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace post create failed:',error);
    return fail('お知らせを投稿できませんでした。',500);
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if(!isSameOrigin(request)) return fail('不正な操作です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {id?:unknown;action?:unknown;title?:unknown;body?:unknown;value?:unknown}|null;
    if(!body||typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)) return fail('投稿IDが正しくありません。');
    const {data:post,error}=await context.admin.from('workspace_posts').select('id,author_user_id,is_pinned')
      .eq('id',body.id).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
    if(error) throw error;
    if(!post) return fail('投稿が見つかりません。',404);
    if(body.action==='pin') {
      if(!['owner','admin'].includes(role)) return fail('ピン留めを変更する権限がありません。',403);
      const {data,error:updateError}=await context.admin.from('workspace_posts')
        .update({is_pinned:body.value===true,updated_at:new Date().toISOString()})
        .eq('id',post.id).eq('workspace_id',workspaceId).select('id,is_pinned').single();
      if(updateError) throw updateError;
      await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:data.is_pinned?'post_pinned':'post_unpinned',targetType:'post',targetId:post.id});
      if(data.is_pinned) {
        const {data:members}=await context.admin.from('workspace_members').select('user_id').eq('workspace_id',workspaceId).eq('status','active').neq('user_id',context.userId).limit(250);
        if(members?.length) await context.admin.from('workspace_notifications').insert(members.map((m)=>({workspace_id:workspaceId,recipient_user_id:m.user_id,notification_type:'post_pinned',title:'重要なお知らせがピン留めされました',body:'グループのお知らせを確認してください。',reference_id:post.id})));
      }
      return NextResponse.json({success:true,post:data},{headers:noStoreHeaders});
    }
    if(body.action!=='edit') return fail('操作内容が正しくありません。');
    if(post.author_user_id!==context.userId&&!['owner','admin','editor'].includes(role)) return fail('この投稿を編集する権限がありません。',403);
    const title=typeof body.title==='string'?body.title.trim():'';
    const content=typeof body.body==='string'?body.body.trim():'';
    if(title.length<1||title.length>160) return fail('タイトルは1〜160文字で入力してください。');
    if(content.length>10000) return fail('本文は10,000文字以内にしてください。');
    const {error:updateError}=await context.admin.from('workspace_posts').update({title,body:content,updated_at:new Date().toISOString()}).eq('id',post.id).eq('workspace_id',workspaceId);
    if(updateError) throw updateError;
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'post_edited',targetType:'post',targetId:post.id});
    return NextResponse.json({success:true},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace post update failed:',error);
    return fail('投稿を更新できませんでした。',500);
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
  if(!isSameOrigin(request)) return fail('不正な操作です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {id?:unknown}|null;
    if(typeof body?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id)) return fail('投稿IDが正しくありません。');
    const {data:post,error}=await context.admin.from('workspace_posts').select('id,author_user_id')
      .eq('id',body.id).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
    if(error) throw error;
    if(!post) return fail('投稿が見つかりません。',404);
    if(post.author_user_id!==context.userId&&!['owner','admin','editor'].includes(role)) return fail('この投稿を削除する権限がありません。',403);
    const {error:updateError}=await context.admin.from('workspace_posts').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('id',post.id).eq('workspace_id',workspaceId);
    if(updateError) throw updateError;
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'post_deleted',targetType:'post',targetId:post.id});
    return NextResponse.json({success:true},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace post delete failed:',error);
    return fail('投稿を削除できませんでした。',500);
  }
}
