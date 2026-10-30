import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildClassTimetableFlexMessage, getTokyoTomorrowTimetableInfo, mapClassTimetableRows, CLASS_TIMETABLE_DATA, type ClassTimetableRow } from '@/lib/class-timetable';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stableRetryKey(dateKey: string): string {
  const chars = createHash('sha256').update('campussync-class-timetable:' + dateKey)
    .digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16)
    + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { mode?: unknown };
  const manualRequest = body?.mode === 'manual';
  if (!manualRequest) {
    return NextResponse.json({
      success: true,
      skipped: true,
      message: '翌日の時間割定期配信は16:00の日次まとめへ統合されました。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (manualRequest) {
    const expectedPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const providedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !providedPassword || !constantTimeEqual(expectedPassword, providedPassword)) {
      return jsonError('翌日の時間割をテスト送信するには、正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const configuredSecret = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!configuredSecret || !providedSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
      return jsonError('時間割の定期配信認証に失敗しました。', 401);
    }
  }

  const activeLineBot = await getActiveLineBot();
      const accessToken = activeLineBot?.accessToken || null;
  if (!accessToken) return jsonError('Vercelの現在使用中のLINE BOTのアクセストークンが設定されていません。', 503);

  const tomorrow = getTokyoTomorrowTimetableInfo();
  if (!tomorrow.dayKey) {
    const message = '明日は' + tomorrow.dayLabel + '曜日で時間割がないため、LINE送信をスキップしました。';
    if (manualRequest) return jsonError(message, 400);
    return NextResponse.json({ success: true, skipped: true, message }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  let timetable = CLASS_TIMETABLE_DATA;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'',key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
  if(url&&key){
    const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await db.from('class_timetable_slots').select('group_name,day_key,period,subject,teacher').order('group_name').order('day_key').order('period');
    if(!error&&data?.length)timetable=mapClassTimetableRows(data as ClassTimetableRow[]);
    else if(error)console.error('LINE手動時間割：DB取得エラー（初期データへフォールバック）',error.message);
  }
  const flex=buildClassTimetableFlexMessage(tomorrow.dayKey,tomorrow.dateLabel,timetable);
  const retryKey = manualRequest ? randomUUID() : stableRetryKey(tomorrow.dateKey);

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages: [flex] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    // LINE may return 409 when a scheduled request with this retry key was accepted already.
    if (!response.ok && response.status !== 409) {
      console.error('翌日の時間割LINE配信に失敗:', response.status);
      return jsonError(
        response.status === 429
          ? 'LINEの送信上限に達した可能性があります。公式アカウントの通数を確認してください。'
          : '翌日の時間割をLINEに送信できませんでした（HTTP ' + response.status + '）。LINE Developersとアクセストークンを確認してください。',
        502,
      );
    }

    // Only groups that explicitly enable receive_class_timetable receive this message.
    // Groups reserved for train timetable updates are excluded unless separately opted in.
    const groupDelivery = await pushLineMessagesToRegisteredChats(
      accessToken,
      [flex],
      retryKey,
      'class_timetable',
    );

    const message = tomorrow.dateLabel + '（7組・8組）の時間割をLINE公式アカウントの友だちへ'
      + (response.status === 409 ? '配信済みとして確認しました。' : '送信しました。')
      + ' ' + summarizeLineGroupDelivery(groupDelivery);

    return NextResponse.json({
      success: true,
      skipped: false,
      date: tomorrow.dateKey,
      day: tomorrow.dayLabel,
      groupDelivery,
      message,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('翌日の時間割LINE配信通信エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('翌日の時間割をLINEに送信できませんでした。Vercelのログを確認してください。', 502);
  }
}
