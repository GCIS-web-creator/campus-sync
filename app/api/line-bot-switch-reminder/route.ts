import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

function constantTimeEqual(a:string,b:string):boolean {
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length&&timingSafeEqual(left,right);
}
function tokyoDateKey(value:Date):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return String(values.year)+'-'+String(values.month)+'-'+String(values.day);
}
function stableRetryKey(switchAt:string):string {
  const chars=createHash('sha256').update('campussync-bot-switch-reminder:'+switchAt).digest('hex').slice(0,32).split('');
  chars[12]='4';chars[16]=((parseInt(chars[16],16)&3)|8).toString(16);
  const value=chars.join('');
  return value.slice(0,8)+'-'+value.slice(8,12)+'-'+value.slice(12,16)+'-'+value.slice(16,20)+'-'+value.slice(20);
}
function createAdminClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return null;
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
function jsonError(message:string,status:number) {
  return NextResponse.json({success:false,message},{status,headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request) {
  const expected=process.env.CRON_SECRET||'';
  const authorization=request.headers.get('authorization')||'';
  const received=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!expected||!received||!constantTimeEqual(expected,received))return jsonError('BOT切替予告Cronの認証に失敗しました。',401);

  const now=new Date();
  const localParts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(now);
  const local=Object.fromEntries(localParts.map(part=>[part.type,part.value]));
  const currentMinute=Number(local.hour)*60+Number(local.minute);
  if(currentMinute<1260||currentMinute>=1270){
    return NextResponse.json({success:true,skipped:true,message:'BOT切替予告は毎日21:00（日本時間）に確認します。'});
  }

  const admin=createAdminClient();
  if(!admin)return jsonError('SUPABASE_SERVICE_ROLE_KEYが設定されていません。',503);
  const {data:rotation,error}=await admin.from('line_bot_rotation')
    .select('active_bot_slot,next_switch_at')
    .eq('id',1).maybeSingle();
  if(error||!rotation?.next_switch_at){
    console.error('BOT切替予告：切替予定の取得失敗',error?.message);
    return jsonError('BOT切替予定を取得できません。line_bot_rotationを確認してください。',500);
  }

  const tomorrow=tokyoDateKey(new Date(now.getTime()+24*60*60*1000));
  const switchAt=new Date(String(rotation.next_switch_at)).toISOString();
  if(tokyoDateKey(new Date(switchAt))!==tomorrow){
    return NextResponse.json({success:true,skipped:true,message:'明日はBOT切替日ではありません。'});
  }

  const currentSlot=Number(rotation.active_bot_slot);
  if(![1,2,3].includes(currentSlot))return jsonError('現在のBOT番号が不正です。',500);
  const nextSlot=currentSlot===3?1:currentSlot+1;
  const activeBot=await getActiveLineBot();
  if(!activeBot?.accessToken)return jsonError('現在使用中のBOTのアクセストークンがありません。',503);

  const retryKey=stableRetryKey(switchAt);
  const existing=await admin.from('line_broadcast_history').select('id').eq('delivery_batch_id',retryKey).maybeSingle();
  if(!existing.error&&existing.data){
    return NextResponse.json({success:true,alreadySent:true,message:'このBOT切替予告はすでに送信済みです。'});
  }

  const dateLabel=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(switchAt));
  const timeLabel=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(switchAt));
  const message={
    type:'flex',
    altText:'【CampusSync】明日はBOT切替日です。公式アカウントの切替予定をご確認ください。',
    contents:{
      type:'bubble',size:'mega',
      header:{type:'box',layout:'vertical',backgroundColor:'#0F3B63',paddingAll:'18px',spacing:'sm',contents:[
        {type:'text',text:'CAMPUSSYNC / BOT ROTATION',size:'xs',color:'#67E8F9',weight:'bold'},
        {type:'text',text:'明日はBOT切替日です',size:'xl',color:'#FFFFFF',weight:'bold',wrap:true},
      ]},
      body:{type:'box',layout:'vertical',paddingAll:'18px',spacing:'md',contents:[
        {type:'text',text:dateLabel+' '+timeLabel+' に公式アカウントを切り替える予定です。',size:'sm',color:'#334155',weight:'bold',wrap:true},
        {type:'box',layout:'horizontal',justifyContent:'space-between',paddingAll:'12px',backgroundColor:'#EFF6FF',cornerRadius:'10px',contents:[
          {type:'text',text:'現在 BOT '+currentSlot,size:'sm',color:'#1E3A8A',weight:'bold'},
          {type:'text',text:'→',size:'sm',color:'#64748B'},
          {type:'text',text:'次 BOT '+nextSlot,size:'sm',color:'#0369A1',weight:'bold'},
        ]},
        {type:'text',text:'管理担当者は、切替先のグループへの招待・退出状況を確認してください。',size:'xs',color:'#64748B',wrap:true},
      ]},
      footer:{type:'box',layout:'vertical',paddingAll:'10px',backgroundColor:'#F8FAFC',contents:[
        {type:'text',text:'CAMPUSSYNC・SOKA HIGH SCHOOL',size:'xs',color:'#64748B',align:'center'},
      ]},
    },
  };

  // LINEのbroadcastは公式アカウントの友だち向けです。グループ送信関数は呼び出しません。
  const response=await fetch('https://api.line.me/v2/bot/message/broadcast',{
    method:'POST',
    headers:{Authorization:'Bearer '+activeBot.accessToken,'Content-Type':'application/json','X-Line-Retry-Key':retryKey},
    body:JSON.stringify({messages:[message]}),
    cache:'no-store',
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok&&response.status!==409){
    const details=await response.text().catch(()=> '');
    console.error('BOT切替予告の友だち向け配信失敗:',response.status,details.slice(0,400));
    return jsonError('BOT切替予告を友だちへ送信できませんでした（HTTP '+response.status+'）。',502);
  }

  const history=await admin.from('line_broadcast_history').insert({
    title:'BOT切替前日予告',
    message:'明日はBOT切替日です。BOT '+currentSlot+' → BOT '+nextSlot,
    status:'sent',
    sent_at:new Date().toISOString(),
    delivery_batch_id:retryKey,
    bot_slot:activeBot.slot>0?activeBot.slot:null,
  });
  if(history.error){
    const fallback=await admin.from('line_broadcast_history').insert({
      title:'BOT切替前日予告',
      message:'明日はBOT切替日です。BOT '+currentSlot+' → BOT '+nextSlot,
      status:'sent',
      sent_at:new Date().toISOString(),
      delivery_batch_id:retryKey,
    });
    if(fallback.error)console.error('BOT切替予告の履歴保存失敗:',fallback.error.message);
  }

  return NextResponse.json({
    success:true,
    groupsSent:false,
    message:'BOT '+currentSlot+'からBOT '+nextSlot+'への切替予告を公式アカウントの友だちだけに配信しました。',
  },{headers:{'Cache-Control':'no-store'}});
}
