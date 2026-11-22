import { createClient } from '@supabase/supabase-js';
import { getLineDeliveryPriorityWindow } from '@/lib/line-delivery-priority';
import { getLineWebhookCredentials } from '@/lib/line-bot-rotation';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { buildCampusAiFlexMessage } from '@/lib/line-flex';
import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { createECDH, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type OutboxRow = {
  id: number;
  user_id: string;
  student_id: string;
  category: string;
  title: string;
  body: string;
  url: string;
  priority: 'normal' | 'high' | 'urgent';
  tag: string;
  attempts: number;
};
type SubscriptionRow = {
  endpoint: string;
  user_id: string;
  subscription: Parameters<typeof webpush.sendNotification>[0];
};
type PreferenceRow = {
  user_id: string;
  timezone: string | null;
  notification_settings: Record<string, unknown> | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
};


type ScheduledLineNotification = {
  id: string;
  line_user_id: string;
  bot_slot: 0 | 1 | 2 | 3 | 4 | 5;
  message: string;
  scheduled_at: string;
  attempts: number;
};

async function dispatchScheduledLineNotifications(admin: any): Promise<{
  checked: number; sent: number; retrying: number; failed: number;
}> {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleSendingBefore = new Date(now.getTime() - 3 * 60 * 1000).toISOString();

  // 3分以上sendingのまま残った行は、前回の実行が中断されたものとして再キューへ戻す。
  const { error: recoverError } = await admin.from('line_scheduled_notifications')
    .update({ status: 'pending', updated_at: nowIso })
    .eq('status', 'sending')
    .lt('updated_at', staleSendingBefore);
  if (recoverError) throw new Error('LINEリマインダーの中断状態を復旧できません: ' + recoverError.message);

  const { data, error } = await admin.from('line_scheduled_notifications')
    .select('id,line_user_id,bot_slot,message,scheduled_at,attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .or('next_attempt_at.is.null,next_attempt_at.lte.' + nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(10);
  if (error) throw new Error('期限到来リマインダーを取得できません: ' + error.message);

  const dueRows = (data || []) as ScheduledLineNotification[];
  if (!dueRows.length) return { checked: 0, sent: 0, retrying: 0, failed: 0 };

  const credentials = getLineWebhookCredentials();
  let sent = 0;
  let retrying = 0;
  let failed = 0;

  await Promise.all(dueRows.map(async row => {
    const attempt = Math.max(0, Number(row.attempts) || 0) + 1;
    const claimTime = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from('line_scheduled_notifications')
      .update({ status: 'sending', attempts: attempt, updated_at: claimTime })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimError) {
      console.error('LINEリマインダーの送信権取得に失敗:', claimError.message);
      return;
    }
    if (!claimed) return;

    const credential = credentials.find(item => item.slot === row.bot_slot);
    if (!credential) {
      await admin.from('line_scheduled_notifications').update({
        status: 'failed',
        last_error: '登録時のLINE BOTスロットの認証情報が見つかりません。',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'sending');
      failed += 1;
      return;
    }

    const flex = buildCampusAiFlexMessage({
      question: 'リマインダー',
      answer: '🔔 ' + row.message,
    });
    const messages = applyCampusSyncFlexFooters([flex]);

    try {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + credential.accessToken,
          'Content-Type': 'application/json',
          'X-Line-Retry-Key': row.id,
        },
        body: JSON.stringify({ to: row.line_user_id, messages }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      try {
        await recordLineDeliveryResponse(response, {
          channel: 'push',
          destinationType: 'user',
          destinationId: row.line_user_id,
          kind: 'campus_ai_scheduled_reminder',
          accessToken: credential.accessToken,
          retryKey: row.id,
          messages,
        });
      } catch (auditError) {
        console.error('リマインダー配信監査ログの記録に失敗:', auditError instanceof Error ? auditError.message : 'unknown error');
      }

      if (response.ok || response.status === 409) {
        const { error: finishError } = await admin.from('line_scheduled_notifications').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          next_attempt_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id).eq('status', 'sending');
        if (finishError) console.error('LINEリマインダーの送信済み記録に失敗:', finishError.message);
        else sent += 1;
        return;
      }

      const detail = (await response.text().catch(() => '')).slice(0, 450);
      const canRetry = (response.status === 429 || response.status >= 500) && attempt < 3;
      const retryAt = new Date(Date.now() + (attempt === 1 ? 60 : 5 * 60) * 1000).toISOString();
      await admin.from('line_scheduled_notifications').update({
        status: canRetry ? 'pending' : 'failed',
        next_attempt_at: canRetry ? retryAt : null,
        last_error: 'LINE Push HTTP ' + response.status + ': ' + detail,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'sending');
      if (canRetry) retrying += 1;
      else failed += 1;
    } catch (sendError) {
      const detail = sendError instanceof Error ? sendError.message : '不明な送信エラー';
      const canRetry = attempt < 3;
      const retryAt = new Date(Date.now() + (attempt === 1 ? 60 : 5 * 60) * 1000).toISOString();
      await admin.from('line_scheduled_notifications').update({
        status: canRetry ? 'pending' : 'failed',
        next_attempt_at: canRetry ? retryAt : null,
        last_error: detail.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'sending');
      if (canRetry) retrying += 1;
      else failed += 1;
      console.error('LINEリマインダー送信に失敗:', row.id, detail.slice(0, 250));
    }
  }));

  return { checked: dueRows.length, sent, retrying, failed };
}

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET || '';
  const received = request.headers.get('authorization') || '';
  if (!expected || !received.startsWith('Bearer ')) return false;
  const supplied = received.slice(7);
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function localDateTimeToInstant(date: string, hour: number, minute: number, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = wanted;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    const adjustment = wanted - represented;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

function quietHoursReleaseAt(now: Date, preference: PreferenceRow): Date | null {
  if (!preference.quiet_hours_enabled || !preference.quiet_hours_start || !preference.quiet_hours_end) return null;
  const parseMinutes = (value: string): number | null => {
    const match = /^(\d{2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const start = parseMinutes(preference.quiet_hours_start);
  const end = parseMinutes(preference.quiet_hours_end);
  if (start === null || end === null || start === end) return null;

  const timezone = preference.timezone || 'Asia/Tokyo';
  const local = localParts(now, timezone);
  const minuteOfDay = Number(local.hour) * 60 + Number(local.minute);
  const overnight = start > end;
  const isQuiet = overnight
    ? minuteOfDay >= start || minuteOfDay < end
    : minuteOfDay >= start && minuteOfDay < end;
  if (!isQuiet) return null;

  const [endHour, endMinute] = preference.quiet_hours_end.split(':').map(Number);
  let endDate = String(local.year) + '-' + String(local.month) + '-' + String(local.day);
  if (overnight && minuteOfDay >= start) {
    const [year, month, day] = endDate.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    endDate = String(next.getUTCFullYear()) + '-' + String(next.getUTCMonth() + 1).padStart(2, '0') + '-' + String(next.getUTCDate()).padStart(2, '0');
  }
  return localDateTimeToInstant(endDate, endHour, endMinute, timezone);
}

function categoryDefaultEnabled(_category: string): boolean {
  return true;
}

async function finish(
  admin: any,
  id: number,
  outcome: 'sent' | 'skipped' | 'failed',
  error?: string,
) {
  const { error: finishError } = await (admin as any).rpc('push_finish_notification', {
    p_id: id,
    p_outcome: outcome,
    p_error: error || null,
  });
  if (finishError) throw finishError;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: credentialData, error: credentialError } = await admin.rpc('campussync_get_vapid_credentials');
  const credentials = credentialData as { public_key?: string; private_key?: string; subject?: string } | null;
  const vapidPublicKey = credentials?.public_key || '';
  const vapidPrivateKey = credentials?.private_key || '';
  const vapidSubject = credentials?.subject || '';

  // Cron-secret protected diagnostics. Only booleans are returned; key material is never exposed.
  if (new URL(request.url).searchParams.get('diagnostics') === '1') {
    let derivedPublicKeyMatches = false;
    try {
      if (vapidPublicKey && vapidPrivateKey) {
        const ecdh = createECDH('prime256v1');
        ecdh.setPrivateKey(Buffer.from(vapidPrivateKey, 'base64url'));
        const derived = ecdh.getPublicKey(undefined, 'uncompressed').toString('base64url');
        derivedPublicKeyMatches = derived === vapidPublicKey;
      }
    } catch {
      derivedPublicKeyMatches = false;
    }
    return NextResponse.json({
      success: true,
      hasPublicKey: Boolean(vapidPublicKey),
      hasPrivateKey: Boolean(vapidPrivateKey),
      hasSubject: Boolean(vapidSubject),
      clientKeyServedFromSameVaultCredential: Boolean(vapidPublicKey),
      derivedPublicKeyMatches,
      credentialReadSucceeded: !credentialError,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // LINEの予約通知はVAPID/Web Push設定に依存させず、既存の30秒Cronから先に処理する。
  let lineScheduled = { checked: 0, sent: 0, retrying: 0, failed: 0 };
  try {
    lineScheduled = await dispatchScheduledLineNotifications(admin);
  } catch (lineError) {
    console.error('LINE予約通知のディスパッチに失敗:', lineError instanceof Error ? lineError.message : 'unknown error');
  }

  if (credentialError || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('VAPID credentials unavailable from Supabase Vault:', credentialError?.message || 'missing key');
    return NextResponse.json({
      success: false,
      message: 'Push通知のサーバー鍵を取得できません。LINE予約通知の処理結果は lineScheduled を確認してください。',
      lineScheduled,
    }, { status: 503 });
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const { data: claimedRows, error: claimError } = await (admin as any).rpc('push_claim_notifications', { p_limit: 80 });
    if (claimError) throw new Error('通知キューを取得できません: ' + claimError.message);
    const claimed = (claimedRows || []) as OutboxRow[];
    if (!claimed.length) {
      return NextResponse.json({ success: true, claimed: 0, sent: 0, skipped: 0, failed: 0, lineScheduled, checkedAt: new Date().toISOString() });
    }

    const userIds = [...new Set(claimed.map(row => row.user_id))];
    const [{ data: subscriptions, error: subscriptionsError }, { data: preferences, error: preferencesError }] = await Promise.all([
      admin.from('push_subscriptions').select('endpoint,user_id,subscription').in('user_id', userIds),
      admin.from('push_reminder_preferences')
        .select('user_id,timezone,notification_settings,quiet_hours_enabled,quiet_hours_start,quiet_hours_end')
        .in('user_id', userIds),
    ]);
    if (subscriptionsError) throw new Error('通知端末を取得できません: ' + subscriptionsError.message);
    if (preferencesError) throw new Error('通知設定を取得できません: ' + preferencesError.message);

    const subscriptionsByUser = new Map<string, SubscriptionRow[]>();
    for (const item of (subscriptions || []) as SubscriptionRow[]) {
      const list = subscriptionsByUser.get(item.user_id) || [];
      list.push(item);
      subscriptionsByUser.set(item.user_id, list);
    }
    const preferencesByUser = new Map<string, PreferenceRow>();
    for (const item of (preferences || []) as PreferenceRow[]) preferencesByUser.set(item.user_id, item);

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let deferred = 0;

    const priorityWindow = getLineDeliveryPriorityWindow();
    for (const row of claimed) {
      try {
        // 配信優先時間帯は緊急Pushのみ通し、通常・高優先度のPushは終了時刻までキューへ戻す。
        if (priorityWindow && row.priority !== 'urgent') {
          const { error: releaseError } = await (admin as any).rpc('push_release_notification', {
            p_id: row.id,
            p_available_at: priorityWindow.endsAt,
          });
          if (releaseError) throw new Error('通常Pushの延期に失敗しました: ' + releaseError.message);
          deferred += 1;
          continue;
        }

        const preference = preferencesByUser.get(row.user_id);
        const settings = preference?.notification_settings || {};
        const enabled = typeof settings[row.category] === 'boolean'
          ? settings[row.category] === true
          : categoryDefaultEnabled(row.category);
        if (!enabled) {
          await finish(admin, row.id, 'skipped', 'ユーザー設定でこの通知カテゴリがOFFです。');
          skipped += 1;
          continue;
        }

        const userSubscriptions = subscriptionsByUser.get(row.user_id) || [];
        if (!userSubscriptions.length) {
          await finish(admin, row.id, 'skipped', '有効な通知端末がありません。');
          skipped += 1;
          continue;
        }

        if (row.priority !== 'urgent' && preference) {
          const releaseAt = quietHoursReleaseAt(new Date(), preference);
          if (releaseAt) {
            const { error: releaseError } = await (admin as any).rpc('push_release_notification', {
              p_id: row.id,
              p_available_at: releaseAt.toISOString(),
            });
            if (releaseError) throw releaseError;
            deferred += 1;
            continue;
          }
        }

        const payload = JSON.stringify({
          title: row.title,
          body: row.body,
          url: row.url || '/',
          tag: row.tag,
          category: row.category,
          priority: row.priority,
          requireInteraction: row.priority === 'urgent',
        });

        const results = await Promise.allSettled(userSubscriptions.map(subscription =>
          webpush.sendNotification(
            subscription.subscription,
            payload,
            { TTL: 60 * 60 * 24, urgency: row.priority === 'urgent' ? 'high' : row.priority === 'high' ? 'high' : 'normal' },
          )
        ));

        let delivered = 0;
        const staleEndpoints: string[] = [];
        const errors: string[] = [];
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          const subscription = userSubscriptions[index];
          if (result.status === 'fulfilled') {
            delivered += 1;
          } else {
            const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
            if (statusCode === 404 || statusCode === 410) staleEndpoints.push(subscription.endpoint);
            const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
            errors.push('HTTP ' + (statusCode || 'unknown') + ': ' + reason.slice(0, 180));
          }
        }

        if (staleEndpoints.length) {
          await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
        }
        if (delivered > 0) {
          const deliveredEndpoints = userSubscriptions
            .filter((_, index) => results[index].status === 'fulfilled')
            .map(item => item.endpoint);
          await admin.from('push_subscriptions')
            .update({ last_seen_at: new Date().toISOString() })
            .in('endpoint', deliveredEndpoints);
          await finish(admin, row.id, 'sent');
          sent += 1;
        } else {
          await finish(admin, row.id, 'failed', errors.slice(0, 3).join(' / ') || 'Push送信に失敗しました。');
          failed += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '不明なエラー';
        try { await finish(admin, row.id, 'failed', message); } catch (finishError) {
          console.error('通知失敗状態の保存にも失敗:', finishError);
        }
        failed += 1;
        console.error('CampusSync push dispatch failed:', row.id, message);
      }
    }

    return NextResponse.json({
      success: true,
      claimed: claimed.length,
      sent,
      skipped,
      failed,
      deferred,
      lineScheduled,
      checkedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('CampusSync push dispatch failed:', message);
    return NextResponse.json({ success: false, message, lineScheduled }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
