import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

function fail(message:string,status:number){return NextResponse.json({success:false,message},{status,headers:{'Cache-Control':'no-store, private'}});}
function sameOrigin(request:Request){const origin=request.headers.get('origin');try{return Boolean(origin&&new URL(origin).origin===new URL(request.url).origin);}catch{return false;}}
function getAdmin(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;
}
function authError(request:Request){
  if(!verifyAdminSessionRequest(request))return fail('Adminログインが必要です。',401);
  if(!getAdmin())return fail('Supabaseサーバー設定が不足しています。',503);
  return null;
}
export async function GET(request:Request){
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const {data,error}=await admin.from('assignment_suggestions')
    .select('id,title,details,subject,subject_option,target_class,type,due_at,status,created_at')
    .eq('status','pending').order('created_at',{ascending:false}).limit(100);
  if(error)return fail('LINE課題提案を取得できませんでした。',500);
  return NextResponse.json({success:true,suggestions:data||[]},{headers:{'Cache-Control':'no-store, private'}});
}
export async function POST(request:Request){
  if(!sameOrigin(request))return fail('不正な管理操作です。',403);
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const payload=await request.json().catch(()=>null) as {id?:unknown;action?:unknown}|null;
  if(typeof payload?.id!=='string'||!['approve','reject'].includes(String(payload.action)))return fail('承認・却下の指定が正しくありません。',400);
  const {data:suggestion,error:readError}=await admin.from('assignment_suggestions')
    .select('*').eq('id',payload.id).eq('status','pending').maybeSingle();
  if(readError)return fail('課題提案を取得できませんでした。',500);
  if(!suggestion)return fail('この提案は既に処理されています。',409);

  if(payload.action==='reject'){
    const {error}=await admin.from('assignment_suggestions').update({status:'rejected',reviewed_at:new Date().toISOString()}).eq('id',suggestion.id).eq('status','pending');
    if(error)return fail('提案を却下できませんでした。',500);
    return NextResponse.json({success:true});
  }

  const {data:claimed,error:claimError}=await admin.from('assignment_suggestions')
    .update({status:'processing'}).eq('id',suggestion.id).eq('status','pending').select('id').maybeSingle();
  if(claimError||!claimed)return fail('この提案は別のAdminが処理しています。',409);

  const {data:assignment,error:insertError}=await admin.from('assignments').insert({
    title:suggestion.title,details:suggestion.details,source:'LINE生徒提案（Admin承認）',type:suggestion.type,
    subject:suggestion.subject,target_class:suggestion.target_class,subject_option:suggestion.subject_option,
    due:suggestion.due_at?'期限あり':'期限未設定',due_at:suggestion.due_at,is_active:true,
  }).select('*').single();
  if(insertError){
    await admin.from('assignment_suggestions').update({status:'pending'}).eq('id',suggestion.id).eq('status','processing');
    return fail('正式課題として保存できませんでした。提案は承認待ちに戻しました。',500);
  }
  const {error:updateError}=await admin.from('assignment_suggestions').update({
    status:'approved',assignment_id:assignment.id,reviewed_at:new Date().toISOString(),
  }).eq('id',suggestion.id).eq('status','processing');
  if(updateError)console.error('Assignment suggestion approval state update failed:',updateError.message);

  const notification='個別LINE通知は行わず、次回のCampusSync定期まとめに掲載します。';
  return NextResponse.json({success:true,assignment,notification});
}
