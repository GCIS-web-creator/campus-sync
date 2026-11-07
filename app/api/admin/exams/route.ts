import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const SUBJECTS = ['国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健'] as const;

function fail(message:string,status:number){return NextResponse.json({success:false,message},{status,headers:{'Cache-Control':'no-store, private'}});}
function sameOrigin(request:Request){const origin=request.headers.get('origin');try{return Boolean(origin&&new URL(origin).origin===new URL(request.url).origin);}catch{return false;}}
function getAdmin(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;}
function authError(request:Request){if(!verifyAdminSessionRequest(request))return fail('Adminログインが必要です。',401);if(!getAdmin())return fail('Supabaseサーバー設定が不足しています。',503);return null;}
function validDate(value:unknown):value is string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;}
function duration(start:string,end:string){const [sy,sm,sd]=start.split('-').map(Number),[ey,em,ed]=end.split('-').map(Number);return Math.round((Date.UTC(ey,em-1,ed)-Date.UTC(sy,sm-1,sd))/86400000)+1;}

export async function GET(request:Request){
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const {data:exams,error}=await admin.from('school_test_exams').select('*').order('start_date',{ascending:false});
  if(error)return fail('考査日程を取得できませんでした。',500);
  const ids=(exams||[]).map(x=>x.id);let subjects:any[]=[];
  if(ids.length){const result=await admin.from('school_test_subjects').select('*').in('exam_id',ids).order('exam_date').order('sort_order');if(result.error)return fail('実施教科を取得できませんでした。',500);subjects=result.data||[];}
  const grouped=new Map<string,any[]>();
  for(const subject of subjects){const list=grouped.get(subject.exam_id)||[];list.push(subject);grouped.set(subject.exam_id,list);}
  return NextResponse.json({success:true,exams:(exams||[]).map(exam=>({...exam,subjects:grouped.get(exam.id)||[]}))},{headers:{'Cache-Control':'no-store, private'}});
}
export async function POST(request:Request){
  if(!sameOrigin(request))return fail('不正な管理操作です。',403);
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const payload=await request.json().catch(()=>null) as {school_year?:unknown;term?:unknown;exam_type?:unknown;start_date?:unknown;end_date?:unknown;subjects?:Array<{subject?:unknown;exam_date?:unknown}>}|null;
  if(!payload)return fail('送信データを読み取れません。',400);
  const year=Number(payload.school_year),term=Number(payload.term),type=String(payload.exam_type||''),start=payload.start_date,end=payload.end_date;
  if(!Number.isInteger(year)||year<2020||year>2100)return fail('年度を確認してください。',400);
  if(![1,2,3].includes(term))return fail('学期を確認してください。',400);
  if((term===3&&type!=='学年末考査')||(term!==3&&!['中間考査','期末考査'].includes(type)))return fail('学期と考査種別の組み合わせが正しくありません。',400);
  if(!validDate(start)||!validDate(end)||start>end||![3,4].includes(duration(start,end)))return fail('考査期間は3日間または4日間にしてください。',400);
  if(!Array.isArray(payload.subjects)||payload.subjects.length<1||payload.subjects.length>12)return fail('実施教科を1〜12件登録してください。',400);
  const names=new Set<string>(),counts=new Map<string,number>(),rows:Array<{subject:string;exam_date:string;sort_order:number}>=[];
  for(const row of payload.subjects){
    const subject=String(row.subject||''),date=row.exam_date;
    if(!SUBJECTS.includes(subject as typeof SUBJECTS[number]))return fail('教科の指定が不正です。',400);
    if(!validDate(date)||date<start||date>end)return fail(subject+'の試験日は考査期間内にしてください。',400);
    if(names.has(subject))return fail('同じ考査に同じ教科は重複登録できません。',400);
    names.add(subject);
    const count=(counts.get(date)||0)+1;counts.set(date,count);
    if(count>3)return fail('1日最大3教科までです。',400);
    rows.push({subject,exam_date:date,sort_order:count});
  }
  const {data:exam,error:examError}=await admin.from('school_test_exams').insert({school_year:year,term,exam_type:type,start_date:start,end_date:end}).select('*').single();
  if(examError)return fail(examError.code==='23505'?'同じ年度・学期・考査は既に登録されています。':'考査日程を保存できませんでした。',examError.code==='23505'?409:500);
  const {data:examSubjects,error:subjectError}=await admin.from('school_test_subjects').insert(rows.map(row=>({...row,exam_id:exam.id}))).select('*');
  if(subjectError){await admin.from('school_test_exams').delete().eq('id',exam.id);return fail('実施教科を保存できなかったため、考査日程も取り消しました。',500);}
  return NextResponse.json({success:true,exam:{...exam,subjects:examSubjects}},{status:201,headers:{'Cache-Control':'no-store, private'}});
}
export async function DELETE(request:Request){
  if(!sameOrigin(request))return fail('不正な管理操作です。',403);
  const denied=authError(request);if(denied)return denied;
  const admin=getAdmin();if(!admin)return fail('Supabase設定がありません。',503);
  const payload=await request.json().catch(()=>null) as {id?:unknown}|null;
  if(typeof payload?.id!=='string')return fail('考査IDを確認してください。',400);
  const {error}=await admin.from('school_test_exams').delete().eq('id',payload.id);
  if(error)return fail('考査日程を削除できませんでした。',500);
  return NextResponse.json({success:true},{headers:{'Cache-Control':'no-store, private'}});
}
