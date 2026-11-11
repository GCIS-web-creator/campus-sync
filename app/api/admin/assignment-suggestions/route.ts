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
    .select('id,title,details,subject,subject_option,target_class,type,due_at,priority,status,created_at')
    .eq('status','pending').order('created_at',{ascending:false}).limit(100);
  if(error)return fail('LINE課題提案を取得できませんでした。',500);
  return NextResponse.json({success:true,suggestions:data||[]},{headers:{'Cache-Control':'no-store, private'}});
}
export async function POST(request:Request){
  if(!sameOrigin(request))return fail('不正な管理操作です。',403);
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const payload=await request.json().catch(()=>null) as {id?:unknown;action?:unknown;title?:unknown;details?:unknown;subject?:unknown;subject_option?:unknown;target_class?:unknown;type?:unknown;due_at?:unknown;priority?:unknown}|null;
  if(typeof payload?.id!=='string'||!['approve','reject','update'].includes(String(payload.action)))return fail('承認・却下・編集の指定が正しくありません。',400);
  const {data:suggestion,error:readError}=await admin.from('assignment_suggestions')
    .select('*').eq('id',payload.id).eq('status','pending').maybeSingle();
  if(readError)return fail('課題提案を取得できませんでした。',500);
  if(!suggestion)return fail('この提案は既に処理されています。',409);

  if(payload.action==='update'){
    const title=typeof payload.title==='string'?payload.title.trim():'';
    const details=typeof payload.details==='string'?payload.details.trim():'';
    const subject=typeof payload.subject==='string'?payload.subject.trim():'';
    const subjectOption=typeof payload.subject_option==='string'?payload.subject_option:'';
    const targetClass=typeof payload.target_class==='string'?payload.target_class:'all';
    const type=typeof payload.type==='string'?payload.type:'paper';
    const dueAt=payload.due_at===null||payload.due_at===''?null:payload.due_at;
    const priority=typeof payload.priority==='string'?payload.priority:'normal';
    if(!title||title.length>200||details.length>5000)return fail('課題名・詳細の入力内容を確認してください。',400);
    if(dueAt!==null&&(typeof dueAt!=='string'||Number.isNaN(new Date(dueAt).getTime())))return fail('提出期限の日時が正しくありません。',400);
    if(!['normal','important','urgent'].includes(priority))return fail('重要度の指定が正しくありません。',400);
    if(!['paper','classroom','other'].includes(type))return fail('課題の種類が正しくありません。',400);
    if(!['all','science'].includes(targetClass))return fail('対象クラスの指定が正しくありません。',400);
    const validSubjects=['国語演習','古典探求','物理','化学','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他'];
    if(!validSubjects.includes(subject))return fail('教科の指定が正しくありません。',400);
    const validOptions:Record<string,string[]>={'物理':['物理選択者'],'生物':['生物選択者'],'数３':['アドバンスト','スタンダード'],'英コミュ':['Intensive','Standard']};
    if(subjectOption&&(!validOptions[subject]||!validOptions[subject].includes(subjectOption)))return fail('選択科目・コースの指定が正しくありません。',400);
    if(subjectOption&&targetClass!=='science')return fail('選択科目別の課題は理系クラスを対象にしてください。',400);
    if(targetClass==='science'&&validOptions[subject]&&!subjectOption)return fail('対象の選択科目・コースを指定してください。',400);
    const {error}=await admin.from('assignment_suggestions').update({
      title,details,subject,subject_option:subjectOption,target_class:targetClass,type,
      due_at:dueAt,priority,
    }).eq('id',suggestion.id).eq('status','pending');
    if(error)return fail('課題提案を更新できませんでした。',500);
    return NextResponse.json({success:true,message:'提案内容を更新しました。確認後に承認してください。'});
  }

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
    priority:suggestion.priority||'normal',due:suggestion.due_at?'期限あり':'期限未設定',due_at:suggestion.due_at,is_active:true,
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
