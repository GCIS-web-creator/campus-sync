import {createClient} from '@supabase/supabase-js';import {timingSafeEqual} from 'node:crypto';import {NextResponse} from 'next/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
function auth(req:Request){const e=Buffer.from(process.env.CAMPUS_SYNC_ADMIN_PASSWORD||''),r=Buffer.from(req.headers.get('x-admin-password')||'');return e.length>0&&e.length===r.length&&timingSafeEqual(e,r);}
export async function GET(req:Request){
 if(!process.env.CAMPUS_SYNC_ADMIN_PASSWORD||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return NextResponse.json({success:false,message:'管理者またはSupabase設定が不足しています。'},{status:503});
 if(!auth(req))return NextResponse.json({success:false,message:'管理者セッションが確認できません。'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 let {data,error}=await db.from('line_broadcast_history').select('id,title,message,status,sent_at,delivery_batch_id,bot_slot').order('sent_at',{ascending:false}).limit(50);
 if(error){const old=await db.from('line_broadcast_history').select('id,title,message,status,sent_at,delivery_batch_id').order('sent_at',{ascending:false}).limit(50);data=old.data as typeof data;error=old.error;}
 if(error)return NextResponse.json({success:false,message:'LINE配信履歴を取得できません。SQL設定を確認してください。'},{status:500});
 return NextResponse.json({success:true,history:data||[]},{headers:{'Cache-Control':'no-store'}});
}