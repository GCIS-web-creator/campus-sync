import { NextResponse } from 'next/server';
import { getWorkspaceMemberRole, getWorkspaceStudentContext, isSameOrigin, noStoreHeaders, recordWorkspaceAudit, workspaceIdPattern } from '@/lib/workspaces-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const fail=(message:string,status=400)=>NextResponse.json({success:false,message},{status,headers:noStoreHeaders});
const REACTIONS=['like','heart','laugh','surprised','check'] as const;

async function loadChat(request:Request,workspaceId:string) {
  const context=await getWorkspaceStudentContext(request);
  if(!context) return {response:fail('学校アカウントでログインしてください。',401)};
  const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
  if(!role) return {response:fail('このグループのメンバーではありません。',403)};
  const {data,error}=await context.admin.from('workspace_messages')
    .select('id,body,sender_user_id,reply_to_id,edited_at,created_at')
    .eq('workspace_id',workspaceId).is('deleted_at',null)
    .order('created_at',{ascending:false}).limit(100);
  if(error) throw error;
  const messages=(data||[]).reverse();
  const userIds=[...new Set(messages.map((item)=>item.sender_user_id))];
  const messageIds=messages.map((item)=>item.id);
  const [membersResult,reactionsResult]=await Promise.all([
    userIds.length?context.admin.from('workspace_members').select('user_id,display_name,user_class').eq('workspace_id',workspaceId).eq('status','active').in('user_id',userIds):Promise.resolve({data:[],error:null}),
    messageIds.length?context.admin.from('workspace_message_reactions').select('message_id,user_id,reaction').in('message_id',messageIds):Promise.resolve({data:[],error:null}),
  ]);
  if(membersResult.error) throw membersResult.error;
  if(reactionsResult.error) throw reactionsResult.error;
  const names=new Map((membersResult.data||[]).map((item)=>[item.user_id,item]));
  const reactionsByMessage=new Map<string,{reaction:string;count:number;mine:boolean}[]>();
  for(const row of reactionsResult.data||[]) {
    const values=reactionsByMessage.get(row.message_id)||[];
    const current=values.find((item)=>item.reaction===row.reaction);
    if(current) {current.count+=1;if(row.user_id===context.userId) current.mine=true;}
    else values.push({reaction:row.reaction,count:1,mine:row.user_id===context.userId});
    reactionsByMessage.set(row.message_id,values);
  }
  return {context,role,messages:messages.map((item)=>({
    ...item,
    sender_name:names.get(item.sender_user_id)?.display_name||'メンバー',
    sender_class:names.get(item.sender_user_id)?.user_class||'',
    is_mine:item.sender_user_id===context.userId,
    reactions:reactionsByMessage.get(item.id)||[],
  }))};
}

export async function GET(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  try {
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const loaded=await loadChat(request,workspaceId);
    if('response' in loaded) return loaded.response;
    return NextResponse.json({success:true,role:loaded.role,messages:loaded.messages},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace chat read failed:',error);
    return fail('チャットを取得できませんでした。',500);
  }
}

export async function POST(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  if(!isSameOrigin(request)) return fail('不正な送信です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {body?:unknown;reply_to_id?:unknown;action?:unknown;message_id?:unknown;reaction?:unknown}|null;
    if(!body) return fail('送信内容を読み取れません。');

    if(body.action==='react') {
      const messageId=String(body.message_id||'');
      const reaction=String(body.reaction||'');
      if(!/^[0-9a-f-]{36}$/i.test(messageId)||!REACTIONS.includes(reaction as typeof REACTIONS[number])) return fail('リアクションが正しくありません。');
      const {data:message,error:messageError}=await context.admin.from('workspace_messages').select('id')
        .eq('id',messageId).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
      if(messageError) throw messageError;
      if(!message) return fail('対象のメッセージが見つかりません。',404);
      const {data:existing,error:existingError}=await context.admin.from('workspace_message_reactions')
        .select('id').eq('message_id',messageId).eq('user_id',context.userId).eq('reaction',reaction).maybeSingle();
      if(existingError) throw existingError;
      if(existing) {
        const {error}=await context.admin.from('workspace_message_reactions').delete().eq('id',existing.id);
        if(error) throw error;
      } else {
        const {error}=await context.admin.from('workspace_message_reactions').insert({message_id:messageId,user_id:context.userId,reaction});
        if(error) throw error;
      }
      return NextResponse.json({success:true},{headers:noStoreHeaders});
    }

    const text=typeof body.body==='string'?body.body.trim():'';
    if(text.length<1||text.length>5000) return fail('メッセージは1〜5,000文字で入力してください。');
    const {count,error:rateError}=await context.admin.from('workspace_messages').select('id',{count:'exact',head:true})
      .eq('workspace_id',workspaceId).eq('sender_user_id',context.userId).gte('created_at',new Date(Date.now()-60_000).toISOString());
    if(rateError) throw rateError;
    if((count||0)>=20) return fail('短時間の連続送信を制限しています。少し待ってから送信してください。',429);

    let replyToId:string|null=null;
    if(body.reply_to_id!==undefined&&body.reply_to_id!==null&&body.reply_to_id!=='') {
      replyToId=String(body.reply_to_id);
      if(!/^[0-9a-f-]{36}$/i.test(replyToId)) return fail('返信先が正しくありません。');
      const {data:reply,error}=await context.admin.from('workspace_messages').select('id').eq('id',replyToId).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
      if(error) throw error;
      if(!reply) return fail('返信先メッセージが見つかりません。');
    }
    const {data,error}=await context.admin.from('workspace_messages').insert({
      workspace_id:workspaceId,sender_user_id:context.userId,body:text,reply_to_id:replyToId,
    }).select('id,body,sender_user_id,reply_to_id,created_at,edited_at').single();
    if(error) throw error;

    const {data:members}=await context.admin.from('workspace_members').select('user_id')
      .eq('workspace_id',workspaceId).eq('status','active').neq('user_id',context.userId).limit(250);
    if(members?.length) {
      const {error:notificationError}=await context.admin.from('workspace_notifications').insert(members.map((member)=>({
        workspace_id:workspaceId,recipient_user_id:member.user_id,notification_type:'message',
        title:'グループに新しいメッセージがあります',body:text.slice(0,140),reference_id:data.id,
      })));
      if(notificationError) console.warn('Workspace chat notification insert failed:',notificationError.message);
    }
    return NextResponse.json({success:true,message:{...data,sender_name:context.displayName,sender_class:context.userClass,is_mine:true,reactions:[]}},{status:201,headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace chat send failed:',error);
    return fail('メッセージを送信できませんでした。',500);
  }
}

export async function PATCH(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  if(!isSameOrigin(request)) return fail('不正な送信です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {id?:unknown;body?:unknown}|null;
    const id=typeof body?.id==='string'?body.id:'';
    const text=typeof body?.body==='string'?body.body.trim():'';
    if(!/^[0-9a-f-]{36}$/i.test(id)||text.length<1||text.length>5000) return fail('編集内容が正しくありません。');
    const {data:message,error}=await context.admin.from('workspace_messages').select('id,sender_user_id')
      .eq('id',id).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
    if(error) throw error;
    if(!message) return fail('メッセージが見つかりません。',404);
    if(message.sender_user_id!==context.userId&&!['owner','admin'].includes(role)) return fail('このメッセージを編集する権限がありません。',403);
    const {error:updateError}=await context.admin.from('workspace_messages').update({body:text,edited_at:new Date().toISOString()})
      .eq('id',id).eq('workspace_id',workspaceId);
    if(updateError) throw updateError;
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'chat_message_edited',targetType:'message',targetId:id});
    return NextResponse.json({success:true},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace chat edit failed:',error);
    return fail('メッセージを編集できませんでした。',500);
  }
}

export async function DELETE(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  if(!isSameOrigin(request)) return fail('不正な送信です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {id?:unknown}|null;
    const id=typeof body?.id==='string'?body.id:'';
    if(!/^[0-9a-f-]{36}$/i.test(id)) return fail('メッセージIDが正しくありません。');
    const {data:message,error}=await context.admin.from('workspace_messages').select('id,sender_user_id')
      .eq('id',id).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
    if(error) throw error;
    if(!message) return fail('メッセージが見つかりません。',404);
    const moderated=message.sender_user_id!==context.userId;
    if(moderated&&!['owner','admin'].includes(role)) return fail('このメッセージを削除する権限がありません。',403);
    const {error:updateError}=await context.admin.from('workspace_messages').update({deleted_at:new Date().toISOString()}).eq('id',id).eq('workspace_id',workspaceId);
    if(updateError) throw updateError;
    if(moderated) await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'chat_message_moderated_delete',targetType:'message',targetId:id});
    return NextResponse.json({success:true},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace chat delete failed:',error);
    return fail('メッセージを削除できませんでした。',500);
  }
}
