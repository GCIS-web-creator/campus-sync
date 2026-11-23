import { recordLineDeliveryResponse } from './_shared/line-delivery-audit.ts';
import { getActiveLineBot } from './_shared/line-bot-rotation.ts';
import { pushLineMessagesToRegisteredChats } from './_shared/line-group-chats.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHash } from 'node:crypto';

type JmaFeature = {
  id?: unknown;
  type?: unknown;
  geometry?: { coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

type DetectedStrike = {
  source_id: string;
  city_name: '小平市' | '国分寺市' | '東村山市' | '東大和市';
  latitude: number;
  longitude: number;
  occurred_at: string;
  source_properties: Record<string, unknown>;
};

const AREA_CENTERS = [
  { name: '小平市' as const, latitude: 35.728, longitude: 139.477, radiusKm: 4.2 },
  { name: '国分寺市' as const, latitude: 35.702, longitude: 139.481, radiusKm: 3.2 },
  { name: '東村山市' as const, latitude: 35.754, longitude: 139.468, radiusKm: 3.8 },
  { name: '東大和市' as const, latitude: 35.745, longitude: 139.426, radiusKm: 3.2 },
];

function getAdminClient() {
  const url = Deno.env.get('NEXT_PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabaseのサーバー設定が不足しています。');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function parseJmaDateTime(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^\d{14}$/.test(text)) {
    const date = new Date(
      text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8) +
      'T' + text.slice(8, 10) + ':' + text.slice(10, 12) + ':' + text.slice(12, 14) + 'Z',
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (/^\d{12}$/.test(text)) {
    const date = new Date(
      text.slice(0, 4) + '-' + text.slice(4, 6) + '-' + text.slice(6, 8) +
      'T' + text.slice(8, 10) + ':' + text.slice(10, 12) + ':00Z',
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toJmaTime(value: unknown): string {
  const date = parseJmaDateTime(value);
  if (!date) return '';
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const v = Object.fromEntries(p.map(part => [part.type, part.value]));
  return String(v.year) + String(v.month) + String(v.day) + String(v.hour) + String(v.minute) + String(v.second);
}

function toTokyoMinute(date: Date): number {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const v = Object.fromEntries(p.map(part => [part.type, Number(part.value)]));
  return Number(v.hour) * 60 + Number(v.minute);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractPoint(value: unknown): [number, number] | null {
  if (!Array.isArray(value)) return null;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [value[0], value[1]];
  }
  for (const child of value) {
    const result = extractPoint(child);
    if (result) return result;
  }
  return null;
}

function getGroundDischargeCode(properties: Record<string, unknown>): number | null {
  for (const [key, value] of Object.entries(properties)) {
    if (!/(type|kind|discharge|stroke)/i.test(key)) continue;
    if (value === 4 || value === 5 || value === '4' || value === '5') return Number(value);
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized.includes('cloud') || normalized.includes('雲')) return null;
      if (normalized.includes('ground') || normalized.includes('stroke') || normalized.includes('対地') || normalized.includes('落雷')) return 4;
    }
  }
  return null;
}

function getStrikeTime(properties: Record<string, unknown>, fallback: Date): Date {
  const jst = typeof properties.obstimeJST === 'string' ? properties.obstimeJST.trim() : '';
  const jstMatch = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(jst);
  if (jstMatch) {
    const [, year, month, day, hour, minute, second, milliseconds = '0'] = jstMatch;
    return new Date(Date.UTC(
      Number(year), Number(month) - 1, Number(day), Number(hour) - 9,
      Number(minute), Number(second), Number(milliseconds.padEnd(3, '0')),
    ));
  }
  const candidates = [
    properties.datetime, properties.dateTime, properties.timestamp, properties.time,
    properties.observed_at, properties.occurred_at, properties.validtime, properties.validTime,
  ];
  for (const candidate of candidates) {
    const parsed = parseJmaDateTime(candidate);
    if (parsed) return parsed;
  }
  return fallback;
}

function closestCity(latitude: number, longitude: number) {
  const matches = AREA_CENTERS
    .map(area => ({ ...area, distance: haversineKm(latitude, longitude, area.latitude, area.longitude) }))
    .filter(area => area.distance <= area.radiusKm)
    .sort((left, right) => left.distance - right.distance);
  return matches[0] || null;
}

function stableUuid(value: string): string {
  const chars = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hash = chars.join('');
  return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-' + hash.slice(12, 16) + '-' + hash.slice(16, 20) + '-' + hash.slice(20);
}

function formatLocalTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

function normalizeTargetTimes(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['targetTimes', 'data', 'times', 'items']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }
  return [];
}

async function fetchLatestLidenFeatures(now: Date): Promise<DetectedStrike[]> {
  const targetsResponse = await fetch('https://www.jma.go.jp/bosai/nowc/data/nowc/targetTimes_N3.json', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(7000),
  });
  if (!targetsResponse.ok) throw new Error('気象庁雷データ時刻表 HTTP ' + targetsResponse.status);
  const options = normalizeTargetTimes(await targetsResponse.json());
  const nowMs = now.getTime();
  const recentTargets = options
    .map(row => ({
      row,
      valid: parseJmaDateTime(row.validtime ?? row.validTime ?? row.valid_time),
      base: row.basetime ?? row.baseTime ?? row.base_time,
      elements: Array.isArray(row.elements) ? row.elements.map(value => String(value).toLowerCase()) : [],
    }))
    .filter(item => item.valid && item.base && item.elements.includes('liden'))
    .filter(item => item.valid!.getTime() >= nowMs - 20 * 60_000 && item.valid!.getTime() <= nowMs + 2 * 60_000)
    .sort((left, right) => left.valid!.getTime() - right.valid!.getTime())
    .slice(-20);
  if (!recentTargets.length) throw new Error('直近20分以内のLIDENデータがありません。');

  const detected: DetectedStrike[] = [];
  let totalFeatures = 0;
  let typedGround = 0;
  let typedCloud = 0;
  const minTime = now.getTime() - 20 * 60_000;
  const maxTime = now.getTime() + 2 * 60_000;

  for (const target of recentTargets) {
    const validTime = toJmaTime(target.row.validtime ?? target.row.validTime ?? target.row.valid_time);
    const baseTime = toJmaTime(target.base);
    if (!validTime || !baseTime) continue;
    const geoUrl = 'https://www.jma.go.jp/bosai/jmatile/data/nowc/' +
      encodeURIComponent(baseTime) + '/none/' + encodeURIComponent(validTime) +
      '/surf/liden/data.geojson?id=liden';
    const geoResponse = await fetch(geoUrl, {
      headers: { Accept: 'application/geo+json, application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });
    if (!geoResponse.ok) {
      console.warn('LIDEN minute fetch failed:', validTime, geoResponse.status);
      continue;
    }
    const collection = await geoResponse.json() as { features?: JmaFeature[] };
    if (!Array.isArray(collection.features)) continue;
    totalFeatures += collection.features.length;
    const fallbackDate = target.valid!;
    for (const feature of collection.features) {
      const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
      const dischargeCode = getGroundDischargeCode(properties);
      if (dischargeCode === null) {
        typedCloud += 1;
        continue;
      }
      typedGround += 1;
      const point = extractPoint(feature.geometry?.coordinates);
      if (!point) continue;
      const [longitude, latitude] = point;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const occurredAt = getStrikeTime(properties, fallbackDate);
      const occurredMs = occurredAt.getTime();
      if (occurredMs < minTime || occurredMs > maxTime) continue;
      const minuteOfDay = toTokyoMinute(occurredAt);
      if (minuteOfDay < 6 * 60 || minuteOfDay > 19 * 60) continue;
      const city = closestCity(latitude, longitude);
      if (!city) continue;

      const propertyTime = properties.obstimeJST ?? properties.datetime ?? properties.dateTime ?? properties.timestamp ?? properties.time ?? '';
      const propertyId = feature.id ?? properties.id ?? '';
      const sourceId = stableUuid([
        String(propertyId),
        occurredAt.toISOString(),
        latitude.toFixed(5),
        longitude.toFixed(5),
        String(dischargeCode),
      ].join('|'));
      const safeProperties = {
        discharge_type: dischargeCode,
        feature_id: String(propertyId).slice(0, 100),
        time: String(propertyTime || occurredAt.toISOString()).slice(0, 80),
      };
      detected.push({
        source_id: sourceId,
        city_name: city.name,
        latitude,
        longitude,
        occurred_at: occurredAt.toISOString(),
        source_properties: safeProperties,
      });
    }
  }
  console.info('LIDEN lightning watch:', { features: totalFeatures, lidenTimestamps: recentTargets.length, groundCandidates: typedGround, otherCandidates: typedCloud, matched: detected.length });
  return detected;
}

function buildLightningFlex(events: Array<{ city_name: string; occurred_at: string; latitude: number; longitude: number }>) {
  const rows = events.slice(0, 8).map(event => ({
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      { type: 'text', text: '⚡', size: 'lg', flex: 0 },
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        spacing: 'xs',
        contents: [
          { type: 'text', text: event.city_name + '周辺で落雷を検知', size: 'sm', weight: 'bold', color: '#7F1D1D', wrap: true },
          { type: 'text', text: formatLocalTime(event.occurred_at) + 'ごろ ・ 気象庁LIDEN対地放電', size: 'xs', color: '#475569', wrap: true },
        ],
      },
    ],
  }));
  return {
    type: 'flex',
    altText: '【CampusSync雷警告】小平・国分寺・東村山・東大和周辺で落雷を検知しました。',
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#7F1D1D',
        paddingAll: '16px',
        spacing: 'xs',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  WEATHER ALERT', size: 'xxs', weight: 'bold', color: '#FECACA' },
          { type: 'text', text: '落雷を検知しました', size: 'xl', weight: 'bold', color: '#FFFFFF' },
          { type: 'text', text: '対象地域の周辺では、屋外活動を控えて安全な場所でお過ごしください。', size: 'xs', color: '#FEE2E2', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '14px', spacing: 'md', contents: rows },
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ success: false, message: 'POST only' }, { status: 405 });
  const secret = Deno.env.get('CRON_SECRET') || '';
  const received = request.headers.get('authorization') || '';
  if (!secret || !constantTimeEqual(received, 'Bearer ' + secret)) {
    return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const minLocalMinute = toTokyoMinute(now);
  if (minLocalMinute < 6 * 60 || minLocalMinute > 19 * 60 + 10) {
    return Response.json({ success: true, skipped: true, reason: 'outside-lightning-watch-window' });
  }

  try {
    const admin = getAdminClient();
    const activeBot = await getActiveLineBot();
    if (!activeBot?.accessToken) {
      return Response.json({ success: false, message: 'Active LINE bot credentials are unavailable.' }, { status: 503 });
    }

    const detected = await fetchLatestLidenFeatures(now);
    if (detected.length) {
      const { error: insertError } = await admin
        .from('campussync_lightning_events')
        .upsert(detected, { onConflict: 'source_id', ignoreDuplicates: true });
      if (insertError) throw insertError;
    }

    const cutoff = new Date(now.getTime() - 20 * 60_000).toISOString();
    const { data: pending, error: pendingError } = await admin
      .from('campussync_lightning_events')
      .select('source_id,city_name,latitude,longitude,occurred_at')
      .is('notified_at', null)
      .gte('occurred_at', cutoff)
      .lte('occurred_at', now.toISOString())
      .order('occurred_at', { ascending: true })
      .limit(40);
    if (pendingError) throw pendingError;
    const events = (pending || []) as Array<{ source_id: string; city_name: string; latitude: number; longitude: number; occurred_at: string }>;
    if (!events.length) {
      return Response.json({ success: true, detected: detected.length, sent: false, reason: 'no-new-ground-strikes' });
    }

    const sourceIds = events.map(event => event.source_id).sort();
    const deliveryBatchId = stableUuid(sourceIds.join('|'));
    const message = buildLightningFlex(events);
    const groupDelivery = await pushLineMessagesToRegisteredChats(
      activeBot.accessToken,
      [message],
      deliveryBatchId,
      'weather_alert',
      deliveryBatchId,
    );
    const sentAll = !groupDelivery.lookupError && groupDelivery.registered > 0 && groupDelivery.failed === 0;
    if (sentAll) {
      const { error: markError } = await admin
        .from('campussync_lightning_events')
        .update({ notified_at: new Date().toISOString(), delivery_batch_id: deliveryBatchId })
        .in('source_id', sourceIds)
        .is('notified_at', null);
      if (markError) console.error('落雷警告の送信済み記録に失敗しました:', markError.message);
    }
    const response = new Response(JSON.stringify({ success: sentAll, status: sentAll ? 'sent' : 'not-fully-delivered' }), {
      status: sentAll ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
    await recordLineDeliveryResponse(response, {
      channel: 'push',
      kind: 'weather_alert',
      destinationType: 'group',
      accessToken: activeBot.accessToken,
      botSlot: activeBot.slot,
      retryKey: deliveryBatchId,
      deliveryBatchId,
      messages: [message],
    });
    return Response.json({
      success: sentAll,
      detected: detected.length,
      pending: events.length,
      groupDelivery,
      sentAll,
    }, { status: sentAll ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('LIDEN落雷監視に失敗しました:', error instanceof Error ? error.message : 'unknown');
    return Response.json({
      success: false,
      message: error instanceof Error ? error.message : 'LIDEN lightning watch failed',
    }, { status: 502 });
  }
}
