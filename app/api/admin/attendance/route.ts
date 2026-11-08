import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, private' };
const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status, headers: noStore });
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const status = url.searchParams.get('status');
  const query = url.searchParams.get('q')?.trim().slice(0,80) || '';
  let requestQuery = admin.from('attendance_reports')
    .select('id,student_id,student_name,user_class,report_type,report_date,expected_time,note,status,admin_note,created_at,updated_at,processed_at')
    .order('report_date',{ascending:false}).order('created_at',{ascending:false}).limit(500);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) requestQuery = requestQuery.eq('report_date',date);
  if (status && ['received','reviewing','processed','needs_contact','canceled'].includes(status)) requestQuery = requestQuery.eq('status',status);
  if (query) {
    const safeQuery = query.replace(/[,%()]/g, '');
    if (/^[0-9]{6}$/.test(safeQuery)) requestQuery = requestQuery.eq('student_id', safeQuery);
    else if (/^[1-3]-[1-8]$/.test(safeQuery)) requestQuery = requestQuery.eq('user_class', safeQuery);
    else requestQuery = requestQuery.ilike('student_name', '%' + safeQuery + '%');
  }
  const {data,error}=await requestQuery;
  if(error){console.error('Attendance admin list failed:',error.message);return fail('出欠連絡一覧を取得できませんでした。',500);}
  return NextResponse.json({success:true,reports:data||[]},{headers:noStore});
}
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な操作です。',403);
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。',401);
  const admin=getStudyMaterialsAdminClient();
  if(!admin)return fail('Supabaseのサーバー設定が不足しています。',503);
  const body=await request.json().catch(()=>null) as {id?:unknown;status?:unknown;admin_note?:unknown}|null;
  if(typeof body?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return fail('対象IDが正しくありません。');
  if(!['received','reviewing','processed','needs_contact','canceled'].includes(String(body.status)))return fail('受付状況が正しくありません。');
  const adminNote=typeof body.admin_note==='string'?body.admin_note.trim():'';
  if(adminNote.length>500)return fail('管理メモは500文字以内にしてください。');
  const now=new Date().toISOString();
  const update={status:body.status,admin_note:adminNote,updated_at:now,processed_at:body.status==='processed'?now:null};
  const {data,error}=await admin.from('attendance_reports').update(update).eq('id',body.id)
    .select('id,status,admin_note,updated_at,processed_at').maybeSingle();
  if(error||!data){console.error('Attendance admin update failed:',error?.message);return fail('受付状況を更新できませんでした。',error?500:404);}
  return NextResponse.json({success:true,report:data},{headers:noStore});
}
