import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { pushLineMessagesToRegisteredChats } from '@/lib/line-group-chats';
import { buildLineEarthquakeFlex, type EarthquakeNotificationPayload } from '@/lib/line-earthquake-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabaseサーバー環境変数が未設定です。');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
type ObservedArea = {
  name?: string; prefecture?: string | null; intensity?: string | null; intensityRank?: number | null;
};
type EarthquakeRow = {
  event_key: string; product_code: string; title: string; event_time: string | null; issued_at: string;
  hypocenter_name: string | null; magnitude: number | string | null; depth_km: number | string | null;
  latitude: number | null; longitude: number | null; max_intensity: string | null; kodaira_intensity: string | null;
  eew_targets: string[] | null; eew_forecast_intensity: string | null; observed_areas: ObservedArea[] | null;
};

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  try {
    const admin = getAdmin();
    const { data, error } = await admin.from('jma_earthquakes')
      .select('event_key,product_code,title,event_time,issued_at,hypocenter_name,magnitude,depth_km,latitude,longitude,max_intensity,kodaira_intensity,eew_targets,eew_forecast_intensity,observed_areas')
      .eq('product_code', 'VXSE53').not('observed_areas', 'eq', '[]')
      .order('event_time', { ascending: false, nullsFirst: false }).limit(40);
    if (error) throw error;
    const keys = (data || []).map(row => String(row.event_key));
    const { data: notices, error: noticeError } = keys.length
      ? await admin.from('jma_earthquake_admin_group_notices')
          .select('event_key,status,groups_sent_at,last_error').in('event_key', keys)
      : { data: [], error: null };
    if (noticeError) throw noticeError;
    const byKey = new Map((notices || []).map(row => [String(row.event_key), row]));
    return NextResponse.json({
      events: (data || []).map(row => ({
        ...row, noticeStatus: byKey.get(String(row.event_key))?.status || 'not_sent',
        noticeSentAt: byKey.get(String(row.event_key))?.groups_sent_at || null,
        noticeError: byKey.get(String(row.event_key))?.last_error || null,
      })),
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Admin earthquake list failed:', error instanceof Error ? error.message : 'unknown');
    return fail('地震情報を読み込めませんでした。', 500);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な送信元からの要求です。', 403);
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const body = await request.json().catch(() => null) as { eventKey?: unknown } | null;
  const eventKey = typeof body?.eventKey === 'string' ? body.eventKey.trim() : '';
  if (!eventKey || eventKey.length > 160) return fail('地震情報を選択してください。', 400);

  let admin: ReturnType<typeof getAdmin> | null = null;
  try {
    admin = getAdmin();
    const { data: row, error: rowError } = await admin.from('jma_earthquakes')
      .select('event_key,product_code,title,event_time,issued_at,hypocenter_name,magnitude,depth_km,latitude,longitude,max_intensity,kodaira_intensity,eew_targets,eew_forecast_intensity,observed_areas')
      .eq('event_key', eventKey).maybeSingle();
    if (rowError) throw rowError;
    if (!row) return fail('指定された地震情報が見つかりません。', 404);
    const quake = row as EarthquakeRow;
    if (quake.product_code !== 'VXSE53' || !Array.isArray(quake.observed_areas) || quake.observed_areas.length === 0) {
      return fail('実際の観測地点データがある気象庁の震源・震度情報だけを通知できます。', 400);
    }
    const { data: existing, error: existingError } = await admin.from('jma_earthquake_admin_group_notices')
      .select('status,last_attempt_at').eq('event_key', eventKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'sent') return fail('この地震情報はすでにLINEグループへ通知済みです。', 409);
    if (existing?.status === 'sending' && existing.last_attempt_at
      && Date.now() - Date.parse(existing.last_attempt_at) < 120_000) return fail('この地震情報は現在送信処理中です。', 409);

    const payload: EarthquakeNotificationPayload = {
      kind: 'admin_manual_group',
      eventTime: quake.event_time || quake.issued_at, issuedAt: quake.issued_at,
      hypocenterName: quake.hypocenter_name || quake.title || '震源情報',
      magnitude: quake.magnitude === null ? null : Number(quake.magnitude),
      depthKm: quake.depth_km === null ? null : Number(quake.depth_km),
      latitude: quake.latitude, longitude: quake.longitude,
      maxIntensity: quake.max_intensity, kodairaIntensity: quake.kodaira_intensity,
      eewTargets: quake.eew_targets || [], eewForecastIntensity: quake.eew_forecast_intensity,
      sourceUrl: 'https://www.jma.go.jp/bosai/map.html#contents=earthquake_map',
      observedAreas: quake.observed_areas.map(area => ({
        name: String(area.name || '観測地域'), prefecture: area.prefecture || null,
        intensity: area.intensity || (typeof area.intensityRank === 'number' ? String(area.intensityRank) : null),
      })),
    };
    const now = new Date().toISOString();
    const { error: reserveError } = await admin.from('jma_earthquake_admin_group_notices').upsert({
      event_key: eventKey, status: 'sending', payload, groups_sent_at: null, groups_result: null,
      last_error: null, last_attempt_at: now, updated_at: now,
    }, { onConflict: 'event_key' });
    if (reserveError) throw reserveError;

    const bot = await getActiveLineBot();
    if (!bot?.accessToken) {
      const message = '現在使用中のLINE公式アカウントが取得できません。';
      await admin.from('jma_earthquake_admin_group_notices')
        .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() }).eq('event_key', eventKey);
      return fail(message, 503);
    }
    const retryKey = 'campussync-admin-earthquake:' + eventKey;
    const groupDelivery = await pushLineMessagesToRegisteredChats(
      bot.accessToken, [buildLineEarthquakeFlex(payload)], retryKey, 'earthquake_alert', retryKey,
    );
    const success = !groupDelivery.lookupError && groupDelivery.registered > 0
      && groupDelivery.sent === groupDelivery.registered && groupDelivery.failed === 0;
    const completedAt = new Date().toISOString();
    const errorMessage = groupDelivery.lookupError
      || (groupDelivery.registered === 0 ? '通知対象のLINEグループが登録されていません。'
        : groupDelivery.failed > 0 ? groupDelivery.sent + '/' + groupDelivery.registered + '件のグループに送信できませんでした。' : null);
    const { error: updateError } = await admin.from('jma_earthquake_admin_group_notices')
      .update({
        status: success ? 'sent' : 'failed', groups_sent_at: success ? completedAt : null,
        groups_result: groupDelivery, last_error: errorMessage, updated_at: completedAt,
      }).eq('event_key', eventKey);
    if (updateError) throw updateError;
    if (!success) return NextResponse.json({
      success: false, message: errorMessage || 'LINEグループへの送信に失敗しました。', groupDelivery,
    }, { status: 502, headers: { 'Cache-Control': 'no-store, private' } });
    return NextResponse.json({
      success: true, message: 'LINEグループ ' + groupDelivery.sent + '件へ地震情報を通知しました。', groupDelivery,
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Admin earthquake group notice failed:', error instanceof Error ? error.message : 'unknown');
    if (admin) await admin.from('jma_earthquake_admin_group_notices')
      .update({ status: 'failed', last_error: '送信処理中にエラーが発生しました。', updated_at: new Date().toISOString() })
      .eq('event_key', eventKey).eq('status', 'sending');
    return fail('LINEグループ通知に失敗しました。履歴を確認してから再試行してください。', 500);
  }
}
