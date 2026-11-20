import { NextResponse } from 'next/server';
import { authorizePlanetubeUser, NO_STORE, planetubeFail } from '@/lib/planetube-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENT_TYPES = new Set([
  'extension_ready',
  'extension_disconnected',
  'focus_started',
  'focus_paused',
  'focus_resumed',
  'break_started',
  'focus_resumed_from_break',
  'session_ended',
  'extension_error',
  'restriction_status',
]);

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const auth = await authorizePlanetubeUser(request, true);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null) as {
    eventType?: unknown;
    timerSessionId?: unknown;
    extensionVersion?: unknown;
    details?: unknown;
  } | null;
  if (!body || typeof body.eventType !== 'string' || !EVENT_TYPES.has(body.eventType)) {
    return planetubeFail('イベントの種類が正しくありません。', 400);
  }

  const { data: connection, error: connectionError } = await auth.admin
    .from('planetube_connections')
    .select('id,status,approved_scopes')
    .eq('campus_user_id', auth.user.id)
    .maybeSingle();
  if (connectionError) return planetubeFail('連携状態を確認できません。', 500);
  if (!connection || connection.status === 'revoked') {
    return planetubeFail('Planetube連携が開始されていません。', 404);
  }

  const eventType = body.eventType;
  const isHandshakeEvent = eventType === 'extension_ready' || eventType === 'extension_disconnected';
  const isTimerSyncEvent = [
    'focus_started','focus_paused','focus_resumed','break_started',
    'focus_resumed_from_break','session_ended',
  ].includes(eventType);
  const requiredScope = isTimerSyncEvent ? 'focus:sync' : 'extension:control';
  if (!isHandshakeEvent && (
    connection.status !== 'linked' ||
    !connection.approved_scopes?.includes(requiredScope)
  )) {
    return planetubeFail('このイベントの送信は許可されていません。', 403);
  }

  const { count, error: rateError } = await auth.admin
    .from('planetube_extension_events')
    .select('id', { count: 'exact', head: true })
    .eq('campus_user_id', auth.user.id)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString());
  if (rateError) return planetubeFail('イベント受付状態を確認できません。', 500);
  if ((count || 0) >= 60) return planetubeFail('イベント送信が多すぎます。少し待って再試行してください。', 429);

  const safeDetails: Record<string, unknown> = {};
  const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
    ? body.details as Record<string, unknown>
    : {};
  if (details.phase === 'focus' || details.phase === 'break') safeDetails.phase = details.phase;
  if (typeof details.durationSeconds === 'number' && Number.isInteger(details.durationSeconds)) {
    safeDetails.durationSeconds = Math.max(0, Math.min(details.durationSeconds, 10_800));
  }
  if (typeof details.enabled === 'boolean') safeDetails.enabled = details.enabled;
  if (typeof details.errorCode === 'string') safeDetails.errorCode = details.errorCode.slice(0, 64);
  const extensionVersion = typeof body.extensionVersion === 'string'
    ? body.extensionVersion.slice(0, 32)
    : null;
  const timerSessionId = body.timerSessionId == null
    ? null
    : isUuid(body.timerSessionId) ? body.timerSessionId : undefined;
  if (timerSessionId === undefined) return planetubeFail('タイマーセッションIDが正しくありません。', 400);

  const { data: event, error: insertError } = await auth.admin
    .from('planetube_extension_events')
    .insert({
      campus_user_id: auth.user.id,
      event_type: eventType,
      timer_session_id: timerSessionId,
      extension_version: extensionVersion,
      details: safeDetails,
    })
    .select('id,created_at')
    .single();
  if (insertError) {
    console.error('Planetube extension event insert failed:', insertError.message);
    return planetubeFail('イベントを保存できませんでした。', 500);
  }

  if (eventType === 'extension_ready' || eventType === 'extension_disconnected') {
    await auth.admin.from('planetube_connections').update({
      last_extension_seen_at: eventType === 'extension_ready' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', connection.id);
  }

  return NextResponse.json({ success: true, eventId: event.id, createdAt: event.created_at }, { headers: NO_STORE });
}
