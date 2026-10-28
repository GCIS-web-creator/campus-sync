import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildHourlyTrainTimetableFlex, type TimetableDeparture } from '@/lib/line-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TrainRow = { direction: string; departure_time: string; service?: string | null };

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokyoParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value])) as Record<string, string>;
}

function minutesFromTimetableTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function stableRetryKey(windowStart: string): string {
  const hex = createHash('sha256').update('campussync-hourly-train:' + windowStart).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16) + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { mode?: unknown };
  const manualRequest = body?.mode === 'manual';

  if (manualRequest) {
    const expectedPassword = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
    const providedPassword = request.headers.get('x-admin-password') || '';
    if (!expectedPassword || !providedPassword || !constantTimeEqual(expectedPassword, providedPassword)) {
      return jsonError('時刻表の手動配信には正しいAdmin用パスワードが必要です。', 401);
    }
  } else {
    const configuredSecret = process.env.CRON_SECRET || '';
    const authorization = request.headers.get('authorization') || '';
    const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!configuredSecret || !providedSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
      return jsonError('定期配信の認証に失敗しました。', 401);
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!supabaseUrl || !serviceKey || !accessToken) {
    return jsonError('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / LINE_CHANNEL_ACCESS_TOKEN を設定してください。', 503);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const windowStartDate = manualRequest
    ? new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 30_000)
    : new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  // Manual sends are tracked in a minute slot distinct from the scheduled hourly slot.
  const windowStart = windowStartDate.toISOString();
  const rangeStartDate = manualRequest ? now : windowStartDate;
  const parts = tokyoParts(rangeStartDate);
  const startMinute = Number(parts.hour) * 60 + Number(parts.minute);
  const endDate = new Date(rangeStartDate.getTime() + 60 * 60_000);
  const endParts = tokyoParts(endDate);
  const startLabel = parts.hour + ':' + parts.minute;
  const endLabel = endParts.hour + ':' + endParts.minute;
  const startDateLabel = parts.month + '/' + parts.day + ' ' + startLabel;

  const { data: timetableRows, error: timetableError } = await admin
    .from('takanodai_timetable')
    .select('direction,departure_time,service')
    .order('direction', { ascending: true })
    .order('departure_time', { ascending: true });

  if (timetableError) {
    console.error('鷹の台駅時刻表の取得に失敗:', timetableError.message);
    return jsonError('takanodai_timetable から時刻表を取得できませんでした。', 500);
  }

  const rows = (timetableRows || []) as TrainRow[];
  const inWindow = (row: TrainRow): TimetableDeparture | null => {
    const minutes = minutesFromTimetableTime(row.departure_time);
    if (minutes === null) return null;
    const offset = (minutes - startMinute + 1440) % 1440;
    // Scheduled sends cover the current clock hour; Admin manual sends cover
    // the next 60 minutes starting from the current minute (including midnight wrap).
    if (offset >= 60 || (!manualRequest && (minutes < startMinute || minutes >= startMinute + 60))) return null;
    return { time: String(row.departure_time).slice(0, 5), service: row.service || '各駅停車' };
  };
  const kokubunji = rows.filter(row => row.direction === 'kokubunji').map(inWindow).filter((row): row is TimetableDeparture => row !== null);
  const higashimurayama = rows.filter(row => row.direction === 'higashimurayama').map(inWindow).filter((row): row is TimetableDeparture => row !== null);
  const flex = buildHourlyTrainTimetableFlex({
    startLabel: startDateLabel,
    endLabel: manualRequest ? (endParts.hour + ':' + endParts.minute) : (endParts.hour + ':00'),
    kokubunji,
    higashimurayama,
  });

  const retryKey = stableRetryKey(windowStart);
  const { error: claimError } = await admin.from('line_train_timetable_sends').insert({
    window_start: windowStart,
    retry_key: retryKey,
    status: 'sending',
  });

  if (claimError) {
    const { data: prior, error: priorError } = await admin
      .from('line_train_timetable_sends')
      .select('status,retry_key')
      .eq('window_start', windowStart)
      .maybeSingle();
    if (priorError || !prior) {
      console.error('時刻表の送信履歴を確認できません:', priorError?.message || claimError.message);
      return jsonError('定期配信の送信履歴を確認できません。SQL設定を確認してください。', 500);
    }
    if (prior.status === 'sent') {
      return NextResponse.json({ success: true, alreadySent: true, message: manualRequest ? 'この1分枠の手動時刻表はすでに送信済みです。重複配信を防ぐため、次の分に再度お試しください。' : 'この時間帯の時刻表は送信済みです。' });
    }
    if (prior.status === 'sending') {
      return NextResponse.json({ success: false, message: 'この時間帯の時刻表はすでに送信処理中です。' }, { status: 409 });
    }
    const { error: retryClaimError } = await admin
      .from('line_train_timetable_sends')
      .update({ status: 'sending', error_message: null, retry_key: prior.retry_key || retryKey })
      .eq('window_start', windowStart)
      .eq('status', 'failed');
    if (retryClaimError) return jsonError('失敗した配信の再試行を開始できませんでした。', 500);
  }

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
    });
    if (response.ok || response.status === 409) {
      const requestId = response.headers.get('x-line-request-id') || response.headers.get('x-line-accepted-request-id');
      const { error: savedError } = await admin.from('line_train_timetable_sends').update({
        status: 'sent', sent_at: new Date().toISOString(), request_id: requestId, error_message: null,
      }).eq('window_start', windowStart);
      if (savedError) console.error('時刻表の送信成功履歴を保存できません:', savedError.message);
      return NextResponse.json({
        success: true,
        alreadyAccepted: response.status === 409,
        windowStart,
        departures: kokubunji.length + higashimurayama.length,
        message: manualRequest ? '鷹の台駅の現在時刻から今後1時間の発車案内をFlex MessageでLINEへ送信しました。' : '鷹の台駅の今後1時間の発車案内をFlex Messageで配信しました。',
      });
    }
    const { error: savedError } = await admin.from('line_train_timetable_sends').update({
      status: 'failed', error_message: 'LINE API HTTP ' + response.status,
    }).eq('window_start', windowStart);
    if (savedError) console.error('時刻表の失敗履歴を保存できません:', savedError.message);
    console.error('時刻表のLINE配信失敗 HTTP', response.status);
    return jsonError(response.status === 429 ? 'LINEの送信上限に達した可能性があります。' : 'LINEへの時刻表配信に失敗しました。', 502);
  } catch (error) {
    await admin.from('line_train_timetable_sends').update({
      status: 'failed', error_message: 'LINE request failed before a response was received',
    }).eq('window_start', windowStart);
    console.error('時刻表のLINE配信通信エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('LINE APIへの接続に失敗しました。', 502);
  }
}
