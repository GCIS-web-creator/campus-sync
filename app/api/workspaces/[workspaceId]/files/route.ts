import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  ensureWorkspaceFilesBucket,
  getWorkspaceMemberRole,
  getWorkspaceStudentContext,
  isSameOrigin,
  noStoreHeaders,
  recordWorkspaceAudit,
  WORKSPACE_FILE_BUCKET,
  WORKSPACE_FILE_MAX_BYTES,
  WORKSPACE_FILE_MIME_TYPES,
  workspaceIdPattern,
} from '@/lib/workspaces-server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const fail=(message:string,status=400)=>NextResponse.json({success:false,message},{status,headers:noStoreHeaders});
const EXTENSION_MIME:Record<string,string>={
  pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt:'text/plain',csv:'text/csv',
};

export async function GET(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const url=new URL(request.url);
    const downloadId=url.searchParams.get('download');
    if(downloadId) {
      if(!/^[0-9a-f-]{36}$/i.test(downloadId)) return fail('ファイルIDが正しくありません。');
      const {data:file,error}=await context.admin.from('workspace_files').select('id,file_name,storage_path')
        .eq('id',downloadId).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
      if(error) throw error;
      if(!file) return fail('ファイルが見つかりません。',404);
      const {data:signed,error:signedError}=await context.admin.storage.from(WORKSPACE_FILE_BUCKET).createSignedUrl(file.storage_path,300,{download:file.file_name});
      if(signedError||!signed?.signedUrl) throw signedError||new Error('signed URL unavailable');
      return NextResponse.json({success:true,url:signed.signedUrl,expires_in:300},{headers:noStoreHeaders});
    }
    const {data,error}=await context.admin.from('workspace_files')
      .select('id,file_name,mime_type,file_size,folder_path,description,uploaded_by,created_at,updated_at')
      .eq('workspace_id',workspaceId).is('deleted_at',null)
      .order('folder_path',{ascending:true}).order('file_name',{ascending:true}).limit(300);
    if(error) throw error;
    const ids=[...new Set((data||[]).map((item)=>item.uploaded_by))];
    const names=new Map<string,string>();
    if(ids.length) {
      const {data:members,error:memberError}=await context.admin.from('workspace_members').select('user_id,display_name')
        .eq('workspace_id',workspaceId).eq('status','active').in('user_id',ids);
      if(memberError) throw memberError;
      for(const member of members||[]) names.set(member.user_id,member.display_name);
    }
    return NextResponse.json({success:true,files:(data||[]).map((item)=>({...item,uploader_name:names.get(item.uploaded_by)||'メンバー',is_mine:item.uploaded_by===context.userId}))},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace files list failed:',error);
    return fail('ファイル一覧を取得できませんでした。',500);
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
    const form=await request.formData();
    const file=form.get('file');
    if(!file||typeof file==='string') return fail('アップロードするファイルを選択してください。');
    if(file.size<1||file.size>WORKSPACE_FILE_MAX_BYTES) return fail('ファイルは20MB以下にしてください。');
    const fileName=file.name.trim().replace(/[\\/\u0000-\u001f\u007f]/g,'_').slice(0,240);
    const extension=fileName.split('.').pop()?.toLowerCase()||'';
    const expectedMime=EXTENSION_MIME[extension];
    if(!expectedMime||!(WORKSPACE_FILE_MIME_TYPES as readonly string[]).includes(expectedMime)) return fail('対応形式はPDF、PNG、JPEG、DOCX、XLSX、PPTX、TXT、CSVです。');
    if(file.type&&file.type!=='application/octet-stream'&&file.type!==expectedMime) return fail('ファイルの種類と拡張子が一致しません。');
    const descriptionValue=form.get('description');
    const description=typeof descriptionValue==='string'?descriptionValue.trim().slice(0,1000):'';
    const folderValue=form.get('folder_path');
    const folderRaw=typeof folderValue==='string'?folderValue.trim():'';
    const folder=folderRaw.split('/').map((part)=>part.trim()).filter((part)=>part&&part!=='.'&&part!=='..').join('/').slice(0,500);
    await ensureWorkspaceFilesBucket(context.admin);
    const storagePath=workspaceId+'/'+randomUUID()+'.'+extension;
    const bytes=await file.arrayBuffer();
    const {error:uploadError}=await context.admin.storage.from(WORKSPACE_FILE_BUCKET).upload(storagePath,bytes,{
      contentType:expectedMime,
      cacheControl:'60',
      upsert:false,
    });
    if(uploadError) throw uploadError;
    const {data,error:insertError}=await context.admin.from('workspace_files').insert({
      workspace_id:workspaceId,uploaded_by:context.userId,folder_path:folder,file_name:fileName,
      storage_path:storagePath,mime_type:expectedMime,file_size:file.size,description,
    }).select('id,file_name,mime_type,file_size,folder_path,description,uploaded_by,created_at').single();
    if(insertError) {
      await context.admin.storage.from(WORKSPACE_FILE_BUCKET).remove([storagePath]);
      throw insertError;
    }
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'file_uploaded',targetType:'file',targetId:data.id,details:{file_name:fileName,file_size:file.size}});
    return NextResponse.json({success:true,file:{...data,uploader_name:context.displayName,is_mine:true}},{status:201,headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace file upload failed:',error);
    return fail('ファイルをアップロードできませんでした。容量とファイル形式を確認してください。',500);
  }
}

export async function DELETE(request:Request,route:{params:Promise<{workspaceId:string}>}) {
  if(!isSameOrigin(request)) return fail('不正な操作です。',403);
  try {
    const context=await getWorkspaceStudentContext(request);
    if(!context) return fail('学校アカウントでログインしてください。',401);
    const {workspaceId}=await route.params;
    if(!workspaceIdPattern.test(workspaceId)) return fail('グループIDが正しくありません。');
    const role=await getWorkspaceMemberRole(context.admin,workspaceId,context.userId);
    if(!role) return fail('このグループのメンバーではありません。',403);
    const body=await request.json().catch(()=>null) as {id?:unknown}|null;
    const id=typeof body?.id==='string'?body.id:'';
    if(!/^[0-9a-f-]{36}$/i.test(id)) return fail('ファイルIDが正しくありません。');
    const {data:file,error}=await context.admin.from('workspace_files').select('id,storage_path,uploaded_by')
      .eq('id',id).eq('workspace_id',workspaceId).is('deleted_at',null).maybeSingle();
    if(error) throw error;
    if(!file) return fail('ファイルが見つかりません。',404);
    if(file.uploaded_by!==context.userId&&!['owner','admin','editor'].includes(role)) return fail('このファイルを削除する権限がありません。',403);
    const {error:removeError}=await context.admin.storage.from(WORKSPACE_FILE_BUCKET).remove([file.storage_path]);
    if(removeError) throw removeError;
    const {error:updateError}=await context.admin.from('workspace_files').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).eq('workspace_id',workspaceId);
    if(updateError) throw updateError;
    await recordWorkspaceAudit(context.admin,{workspaceId,actorUserId:context.userId,action:'file_deleted',targetType:'file',targetId:id});
    return NextResponse.json({success:true},{headers:noStoreHeaders});
  } catch(error) {
    console.error('Workspace file delete failed:',error);
    return fail('ファイルを削除できませんでした。',500);
  }
}
