import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import {
  getLineBotCredentialsForSlot,
  getLineBotEnvironmentStatus,
  getLineBotSlotForDate,
} from '@/lib/line-bot-rotation';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JST = 'Asia/Tokyo';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type RotationRow = {
  active_bot_slot: number;
  next_switch_at: string;
  last_switched_at: string | null;
  rotation_hold_until: string | null;
  updated_at: string;
};

type RotationEvent = {
  id: number;
  previous_bot_slot: number | null;
  new_bot_slot: number;
  effective_date: string;
  created_at: string;
  acknowledged_at: string | null;
  switch_mode?: string;
  group_confirmed_at?: string | null;
  notice_status?: string;
  notice_sent_at?: string | null;
  notice_error?: string | null;
  notice_retry_key?: string | null;
};

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function validate(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !getAdmin()) {
    return NextResponse.json({
      success: false,
      message: 'CAMPUS_SYNC_ADMIN_PASSWORDまたはSupabaseのサーバー設定が不足しています。',
    }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: 'Admin用パスワードが正しくありません。' }, { status: 401 });
  }
  return null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function dateLabel(value: string): string {
  const date = new Date(value.includes('T') ? value : value + 'T00:00:00+09:00');
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildSwitchCompleteFlex(event: RotationEvent): Record<string, unknown> {
  const previous = event.previous_bot_slot ? 'BOT ' + event.previous_bot_slot : '旧BOT';
  const next = 'BOT ' + event.new_bot_slot;
  const confirmedAt = dateTimeLabel(event.created_at);
  const effectiveDate = dateLabel(event.effective_date);

  return {
    type: 'flex',
    altText: 'CampusSync｜LINE公式アカウントのBOT切替が完了しました｜' + previous + 'から' + next,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#123B43',
        paddingAll: '18px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  BOT ROTATION', size: 'xxs', color: '#A7D3CD', weight: 'bold', wrap: true },
          { type: 'text', text: 'BOT切替が完了しました', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: 'OFFICIAL ACCOUNT UPDATE', size: 'xs', color: '#D5E6E3', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          { type: 'text', text: effectiveDate + ' のBOT切替作業が完了しました。', size: 'sm', color: '#334155', weight: 'bold', wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingAll: '14px',
            backgroundColor: '#ECFDF5',
            cornerRadius: '11px',
            contents: [
              { type: 'text', text: previous, size: 'lg', color: '#475569', weight: 'bold', flex: 3, wrap: true },
              { type: 'text', text: '→', size: 'lg', color: '#64748B', flex: 1, align: 'center' },
              { type: 'text', text: next, size: 'lg', color: '#047857', weight: 'bold', flex: 3, align: 'end', wrap: true },
            ],
          },
          { type: 'text', text: '旧BOTの退出、新BOTのグループ参加、Webhook受信を確認し、CampusSyncの配信先を切り替えました。', size: 'sm', color: '#334155', wrap: true },
          { type: 'text', text: '確認日時：' + confirmedAt, size: 'xs', color: '#64748B', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            paddingAll: '11px',
            cornerRadius: '9px',
            backgroundColor: '#EFF6FF',
            contents: [{
              type: 'text',
              text: 'このメッセージは公式アカウントの友だち向け通知です。連携グループには送信していません。',
              size: 'xs',
              color: '#1E40AF',
              wrap: true,
            }],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        backgroundColor: '#F8FAFC',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}

async function sendManualSwitchNotice(
  admin: ReturnType<typeof getAdmin> & {},
  eventId: number,
): Promise<{ sent: boolean; message: string }> {
  const { data: event, error: eventError } = await admin.from('line_bot_rotation_events')
    .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at,acknowledged_at,switch_mode,notice_status,notice_retry_key')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !event) {
    console.error('BOT切替完了通知の履歴を取得できません:', eventError?.message);
    return { sent: false, message: '切替履歴を確認できません。' };
  }
  if (event.switch_mode !== 'manual') {
    return { sent: false, message: 'この履歴は手動切替通知の対象ではありません。' };
  }
  if (event.notice_status === 'sent') {
    return { sent: true, message: '完了通知はすでに送信済みです。' };
  }
  if (!['pending', 'failed'].includes(String(event.notice_status))) {
    return { sent: false, message: 'この履歴は通知を送信できる状態ではありません。' };
  }
  if (typeof event.notice_retry_key !== 'string') {
    return { sent: false, message: '通知の再送キーがありません。管理者に確認してください。' };
  }

  const slot = Number(event.new_bot_slot);
  if (![1, 2, 3, 4, 5].includes(slot)) {
    return { sent: false, message: '切替先BOT番号が正しくありません。' };
  }
  const credentials = getLineBotCredentialsForSlot(slot as 1 | 2 | 3 | 4 | 5);
  if (!credentials) {
    await admin.from('line_bot_rotation_events').update({
      notice_status: 'failed',
      notice_error: '切替先BOTのChannel Secretまたはアクセストークンが未登録です。',
    }).eq('id', eventId);
    return { sent: false, message: '切替先BOTのLINE認証情報が未登録です。Vercelの環境変数を確認してください。' };
  }

  const message = buildSwitchCompleteFlex(event as RotationEvent);
  const messages = applyCampusSyncFlexFooters([message]);
  let response: Response;
  try {
    // Broadcast delivers to this official account's friends only. No group push API is called here.
    response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + credentials.accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': event.notice_retry_key,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.name : 'network_error';
    await admin.from('line_bot_rotation_events').update({
      notice_status: 'failed',
      notice_error: 'LINE APIへの接続に失敗しました（' + detail + '）。',
    }).eq('id', eventId);
    return { sent: false, message: '公式アカウントへの完了通知に接続できませんでした。通知の再送ができます。' };
  }

  await recordLineDeliveryResponse(response, {
    channel: 'broadcast',
    destinationType: 'official_account',
    kind: 'bot_rotation',
    botSlot: slot,
    accessToken: credentials.accessToken,
    retryKey: event.notice_retry_key,
    deliveryBatchId: event.notice_retry_key,
    messages: [message],
  });

  if (!response.ok && response.status !== 409) {
    await admin.from('line_bot_rotation_events').update({
      notice_status: 'failed',
      notice_error: 'LINE API returned HTTP ' + response.status + '.',
    }).eq('id', eventId);
    return { sent: false, message: '配信BOTは切替済みですが、公式アカウントへの完了通知に失敗しました。通知を再送してください。' };
  }

  const { error: updateError } = await admin.from('line_bot_rotation_events').update({
    notice_status: 'sent',
    notice_sent_at: new Date().toISOString(),
    notice_error: null,
  }).eq('id', eventId);
  if (updateError) {
    console.error('BOT切替完了通知の送信状態を保存できません:', updateError.message);
    return { sent: false, message: '通知はLINEに受け付けられましたが、送信状態を保存できませんでした。再送すると重複送信を防ぐRetry Keyで確認します。' };
  }

  const retryHistory = await admin.from('line_broadcast_history')
    .select('id')
    .eq('delivery_batch_id', event.notice_retry_key)
    .maybeSingle();
  if (!retryHistory.data) {
    const oldLabel = event.previous_bot_slot ? 'BOT ' + event.previous_bot_slot : '旧BOT';
    const { error: historyError } = await admin.from('line_broadcast_history').insert({
      title: 'BOT切替完了通知',
      message: oldLabel + 'からBOT ' + slot + 'へ配信先を切り替えました。通知は公式アカウントの友だち向けのみです。',
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivery_batch_id: event.notice_retry_key,
      bot_slot: slot,
    });
    if (historyError) console.error('BOT切替完了通知の配信履歴を保存できません:', historyError.message);
  }

  return {
    sent: true,
    message: response.status === 409
      ? '完了通知はすでにLINEで受け付け済みでした。送信済みとして記録しました。'
      : '配信先を切り替え、公式アカウントの友だちへ完了通知を送信しました。',
  };
}

export async function GET(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return jsonError('Supabaseの設定が不足しています。', 503);

  const [rotationResult, eventResult, historyResult, activeChatsResult, noticeRetryResult] = await Promise.all([
    admin.from('line_bot_rotation')
      .select('active_bot_slot,next_switch_at,last_switched_at,rotation_hold_until,updated_at')
      .eq('id', 1)
      .maybeSingle(),
    admin.from('line_bot_rotation_events')
      .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at,acknowledged_at,switch_mode,group_confirmed_at,notice_status,notice_sent_at,notice_error')
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('line_bot_rotation_events')
      .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at,acknowledged_at,switch_mode,group_confirmed_at,notice_status,notice_sent_at,notice_error')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('line_group_chats')
      .select('bot_slot,active,last_seen_at,last_event_type')
      .eq('active', true),
    admin.from('line_bot_rotation_events')
      .select('id,previous_bot_slot,new_bot_slot,effective_date,created_at,notice_status,notice_error')
      .eq('switch_mode', 'manual')
      .in('notice_status', ['pending', 'failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (rotationResult.error || !rotationResult.data) {
    console.error('LINE BOTローテーション設定を取得できません:', rotationResult.error?.message);
    return jsonError('LINE BOTローテーション用SQLがまだ実行されていません。supabase/line-bot-rotation.sqlを確認してください。', 503);
  }
  if (historyResult.error || eventResult.error || activeChatsResult.error || noticeRetryResult.error) {
    console.error('LINE BOT切替確認情報の取得に失敗しました:', historyResult.error?.message || eventResult.error?.message || activeChatsResult.error?.message || noticeRetryResult.error?.message);
    return jsonError('BOT切替確認情報を取得できません。SQL設定を確認してください。', 500);
  }

  const rotation = rotationResult.data as RotationRow;
  const activeSlot = Number(rotation.active_bot_slot);
  const nextBotSlot = getLineBotSlotForDate(rotation.next_switch_at);
  const environment = getLineBotEnvironmentStatus();
  const activeChats = (activeChatsResult.data || []) as Array<{ bot_slot: number | null; active: boolean; last_seen_at: string | null; last_event_type: string | null }>;
  const targetBotActiveCount = nextBotSlot
    ? activeChats.filter(chat => Number(chat.bot_slot) === nextBotSlot).length
    : 0;
  const previousBotActiveCount = activeChats.filter(chat => Number(chat.bot_slot) === activeSlot).length;
  const otherBotActiveCount = activeChats.length - targetBotActiveCount - previousBotActiveCount;
  const groupReady = activeChats.length > 0
    && targetBotActiveCount > 0
    && previousBotActiveCount === 0
    && otherBotActiveCount === 0;
  const scheduledAt = Date.parse(rotation.next_switch_at);
  const windowOpensAt = scheduledAt - ONE_DAY_MS;
  const manualSwitchAvailable = Number.isFinite(scheduledAt)
    && Date.now() >= windowOpensAt
    && Boolean(nextBotSlot)
    && nextBotSlot !== activeSlot;

  return NextResponse.json({
    success: true,
    rotation,
    pendingEvent: eventResult.data || null,
    history: historyResult.data || [],
    environment,
    manualSwitch: {
      available: manualSwitchAvailable,
      fromBotSlot: activeSlot,
      toBotSlot: nextBotSlot,
      scheduledAt: rotation.next_switch_at,
      windowOpensAt: new Date(windowOpensAt).toISOString(),
      groupReady,
      activeGroupCount: activeChats.length,
      targetBotActiveCount,
      previousBotActiveCount,
      otherBotActiveCount,
      targetBotConfigured: Boolean(environment.some(item => item.slot === nextBotSlot && item.channelSecretConfigured && item.accessTokenConfigured)),
    },
    noticeRetryEvent: noticeRetryResult.data || null,
    notice: 'Channel Secretとアクセストークンの値はセキュリティのため返却しません。',
  }, { headers: { 'Cache-Control': 'no-store', 'Vary': 'X-Admin-Password' } });
}

async function handleManualSwitch(
  admin: NonNullable<ReturnType<typeof getAdmin>>,
  payload: { currentBotSlot?: unknown; nextSwitchAt?: unknown; groupConfirmed?: unknown },
): Promise<NextResponse> {
  if (payload.groupConfirmed !== true) {
    return jsonError('旧BOTの退出と新BOTのグループ参加を確認してください。', 400);
  }

  const currentBotSlot = Number(payload.currentBotSlot);
  const expectedNextSwitchAt = typeof payload.nextSwitchAt === 'string' ? payload.nextSwitchAt : '';
  if (![1, 2, 3, 4, 5].includes(currentBotSlot) || !expectedNextSwitchAt || !Number.isFinite(Date.parse(expectedNextSwitchAt))) {
    return jsonError('切替前提の情報が正しくありません。画面を更新してください。', 400);
  }

  const { data: rotation, error: rotationError } = await admin.from('line_bot_rotation')
    .select('active_bot_slot,next_switch_at')
    .eq('id', 1)
    .maybeSingle();
  if (rotationError || !rotation) return jsonError('現在の切替予定を取得できません。', 503);
  if (Number(rotation.active_bot_slot) !== currentBotSlot || Date.parse(rotation.next_switch_at) !== Date.parse(expectedNextSwitchAt)) {
    return jsonError('切替予定が更新されています。画面を再読み込みしてください。', 409);
  }

  const scheduledAt = Date.parse(rotation.next_switch_at);
  if (Date.now() < scheduledAt - ONE_DAY_MS) {
    return jsonError('このボタンは切替予定の24時間前から利用できます。', 409);
  }

  const newBotSlot = getLineBotSlotForDate(rotation.next_switch_at);
  if (!newBotSlot || newBotSlot === currentBotSlot) {
    return jsonError('次回のBOT番号を計算できません。', 409);
  }
  if (!getLineBotCredentialsForSlot(newBotSlot)) {
    return jsonError('BOT ' + newBotSlot + ' のChannel Secretとアクセストークンが揃っていません。Vercelの環境変数を確認してください。', 503);
  }

  const { data: activeChats, error: chatsError } = await admin.from('line_group_chats')
    .select('bot_slot,active')
    .eq('active', true);
  if (chatsError) return jsonError('グループの接続状態を確認できません。', 503);
  const chats = activeChats || [];
  const targetCount = chats.filter(chat => Number(chat.bot_slot) === newBotSlot).length;
  const oldCount = chats.filter(chat => Number(chat.bot_slot) === currentBotSlot).length;
  const otherCount = chats.length - targetCount - oldCount;
  if (!chats.length || targetCount < 1 || oldCount > 0 || otherCount > 0) {
    return NextResponse.json({
      success: false,
      message: 'グループ接続の確認が完了していません。旧BOTが退出し、BOT ' + newBotSlot + ' が参加した後、BOT ' + newBotSlot + ' からグループ内でメッセージを送って、Webhookを記録してから状態を更新してください。',
      groupStatus: {
        activeGroupCount: chats.length,
        targetBotActiveCount: targetCount,
        previousBotActiveCount: oldCount,
        otherBotActiveCount: otherCount,
      },
    }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: switchResult, error: switchError } = await admin.rpc('campussync_manual_line_bot_switch', {
    p_expected_current_bot_slot: currentBotSlot,
    p_expected_new_bot_slot: newBotSlot,
    p_expected_next_switch_at: rotation.next_switch_at,
    p_group_confirmed_at: new Date().toISOString(),
  });
  if (switchError) {
    console.error('確認済みBOT切替に失敗しました:', switchError.message);
    return jsonError('配信BOTの切替を保存できませんでした。画面を再読み込みして状態を確認してください。', 409);
  }
  const event = Array.isArray(switchResult) ? switchResult[0] : switchResult;
  const eventId = Number(event?.event_id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return jsonError('配信BOTの切替結果を確認できません。Admin画面を再読み込みしてください。', 500);
  }

  const notice = await sendManualSwitchNotice(admin, eventId);
  return NextResponse.json({
    success: true,
    switched: true,
    noticeSent: notice.sent,
    message: notice.message,
    eventId,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return jsonError('Supabaseの設定が不足しています。', 503);

  const payload = await request.json().catch(() => null) as {
    action?: unknown;
    eventId?: unknown;
    currentBotSlot?: unknown;
    nextSwitchAt?: unknown;
    groupConfirmed?: unknown;
  } | null;
  if (!payload) return jsonError('リクエストを読み取れませんでした。', 400);

  if (payload.action === 'manual-switch') {
    return handleManualSwitch(admin, payload);
  }

  if (payload.action === 'retry-notice') {
    const eventId = Number(payload.eventId);
    if (!Number.isSafeInteger(eventId) || eventId <= 0) return jsonError('通知IDが正しくありません。', 400);
    const notice = await sendManualSwitchNotice(admin, eventId);
    return NextResponse.json({
      success: notice.sent,
      message: notice.message,
    }, { status: notice.sent ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (payload.action !== 'acknowledge') {
    return jsonError('操作内容が正しくありません。', 400);
  }
  const eventId = Number(payload.eventId);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return jsonError('切替通知IDが正しくありません。', 400);

  const { data, error } = await admin.from('line_bot_rotation_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('LINE BOT切替通知の確認保存に失敗:', error.message);
    return jsonError('確認状態を保存できませんでした。', 500);
  }
  if (!data) return jsonError('この通知はすでに確認済みか、存在しません。', 404);

  return NextResponse.json({
    success: true,
    message: 'LINE BOT切替作業を確認済みにしました。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
