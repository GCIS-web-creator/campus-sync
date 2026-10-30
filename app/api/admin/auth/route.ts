import { NextResponse } from 'next/server';
import { clearAdminSessionCookie,createAdminSessionToken,serializeAdminSessionCookie,verifyAdminPassword,verifyAdminSessionRequest } from '@/lib/admin-auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function sameOrigin(request:Request):boolean {
 const origin=request.headers.get('origin');
 if(!origin)return true;
 try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}
export async function GET(request:Request) {
 return NextResponse.json({authenticated:verifyAdminSessionRequest(request)},{headers:{'Cache-Control':'no-store, private'}});
}
export async function POST(request:Request) {
 if(!sameOrigin(request))return NextResponse.json({success:false,message:'不正なログイン要求です。'},{status:403});
 if(!process.env.CAMPUS_SYNC_ADMIN_PASSWORD)return NextResponse.json({success:false,message:'CAMPUS_SYNC_ADMIN_PASSWORD がサーバーに設定されていません。'},{status:503});
 const body=await request.json().catch(()=>null) as {password?:unknown}|null;
 if(!verifyAdminPassword(body?.password))return NextResponse.json({success:false,message:'パスワードが正しくありません。'},{status:401,headers:{'Cache-Control':'no-store'}});
 const session=createAdminSessionToken();
 if(!session)return NextResponse.json({success:false,message:'管理者セッションを作成できませんでした。'},{status:503});
 return NextResponse.json({success:true,expiresAt:new Date(session.expiresAt*1000).toISOString()},{headers:{'Set-Cookie':serializeAdminSessionCookie(session.token),'Cache-Control':'no-store, private'}});
}
export async function DELETE(request:Request) {
 if(!sameOrigin(request))return NextResponse.json({success:false,message:'不正なログアウト要求です。'},{status:403});
 return NextResponse.json({success:true},{headers:{'Set-Cookie':clearAdminSessionCookie(),'Cache-Control':'no-store, private'}});
}