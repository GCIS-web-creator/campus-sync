import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { pushLineMessagesToRegisteredChats } from '@/lib/line-group-chats';
import { buildLineEarthquakeFlex, type EarthquakeNotificationPayload } from '@/lib/line-earthquake-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HIGH_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml';
const LONG_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/eqvol_l.xml';
const MAX_FEED_BYTES = 12 * 1024 * 1024;
const MAX_XML_BYTES = 3 * 1024 * 1024;
const MAX_FEED_ITEMS = 100;
const MAX_LONG_BATCH_ITEMS = 12;
const KODAIRA_EEW_AREA = '東京都多摩東部';

type XmlNode = { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string };
type FeedEntry = { id: string; title: string; href: string; publishedAt: string | null };
type ParsedEarthquake = {
  sourceId: string;
  sourceUrl: string;
  productCode: string;
  title: string;
  headline: string;
  issuedAt: string;
  eventTime: string | null;
  eventKey: string;
  hypocenterName: string | null;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  magnitude: number | null;
  maxIntensity: string | null;
  maxIntensityRank: number | null;
  kodairaIntensity: string | null;
  kodairaIntensityRank: number | null;
  observedAreas: Array<{ name: string; intensity: string | null; intensityRank: number | null }>;
  eewTargets: string[];
  eewKodairaTarget: boolean;
  eewForecastIntensity: string | null;
  isEew: boolean;
  isEewCancelled: boolean;
  isDistant: boolean;
  notificationKind: 'eew_kodaira' | 'kodaira_intensity2' | 'eew_cancelled' | null;
};

function getAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabaseサーバー環境変数が未設定です。');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function localName(name: string): string {
  return name.split(':').pop()?.toLowerCase() || name.toLowerCase();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, number: string) => String.fromCodePoint(parseInt(number, 16)));
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const tokens = xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/[^>]+>|<[^>]+>|[^<]+/gi) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || /^<!DOCTYPE/i.test(token)) continue;
    if (token.startsWith('<![CDATA[')) {
      stack[stack.length - 1].text += token.slice(9, -3);
      continue;
    }
    if (token.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (token.startsWith('<')) {
      const match = token.match(/^<([^\s/>]+)([\s\S]*?)\/?>$/);
      if (!match) continue;
      const attributes: Record<string, string> = {};
      const attrPattern = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let attribute: RegExpExecArray | null;
      while ((attribute = attrPattern.exec(match[2])) !== null) {
        attributes[localName(attribute[1])] = decodeXml(attribute[3] ?? attribute[4] ?? '');
      }
      const node: XmlNode = { name: match[1], attributes, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!/\/\s*>$/.test(token)) stack.push(node);
      continue;
    }
    stack[stack.length - 1].text += decodeXml(token);
  }
  return root;
}

function childrenNamed(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(child => localName(child.name) === name.toLowerCase());
}

function descendantsNamed(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = [];
  const walk = (current: XmlNode) => {
    for (const child of current.children) {
      if (localName(child.name) === name.toLowerCase()) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

function nodeText(node: XmlNode | undefined): string {
  if (!node) return '';
  return (node.text + node.children.map(nodeText).join('')).replace(/\s+/g, ' ').trim();
}

function childText(node: XmlNode, name: string): string {
  return nodeText(childrenNamed(node, name)[0]);
}

function firstText(node: XmlNode, name: string): string {
  return nodeText(descendantsNamed(node, name)[0]);
}

function parseFeed(xml: string, feedUrl: string): FeedEntry[] {
  const root = parseXml(xml);
  return descendantsNamed(root, 'entry').map(entry => {
    const links = childrenNamed(entry, 'link');
    const bestLink = links.find(link => /xml/i.test(link.attributes.type || '') || /alternate/i.test(link.attributes.rel || '')) || links[0];
    const id = childText(entry, 'id');
    const raw = bestLink?.attributes.href || id || '';
    let href = '';
    try {
      const resolved = new URL(raw, feedUrl);
      if (resolved.protocol === 'https:' && (resolved.hostname === 'www.data.jma.go.jp' || resolved.hostname === 'xml.kishou.go.jp')) href = resolved.toString();
    } catch {
      href = '';
    }
    return { id: id || href, title: childText(entry, 'title'), href, publishedAt: childText(entry, 'updated') || childText(entry, 'published') || null };
  }).filter(entry => entry.id && entry.href && (
    /VXSE(43|51|52|53)/i.test(entry.href + ' ' + entry.id)
    || /緊急地震速報|震度速報|震源に関する情報|震源・震度.*情報|遠地地震に関する情報/.test(entry.title)
  ));
}

async function fetchText(url: string, timeoutMs: number, limit: number): Promise<string> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/atom+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error('気象庁XML取得失敗 HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > limit) throw new Error('気象庁XMLがサイズ上限を超えています。');
  return new TextDecoder('utf-8').decode(bytes);
}

function resolveProductCode(entry: FeedEntry, root: XmlNode, control: XmlNode): string {
  const candidates = [
    entry.href,
    entry.id,
    entry.title,
    childText(control, 'Title'),
    firstText(root, 'Title'),
  ].filter(Boolean).join(' ');
  const fromFileName = candidates.match(/VXSE(43|51|52|53)/i);
  if (fromFileName) return ('VXSE' + fromFileName[1]).toUpperCase();

  const label = [childText(control, 'Title'), firstText(root, 'Title'), entry.title].join(' ');
  if (/緊急地震速報.*警報/.test(label)) return 'VXSE43';
  if (/震度速報/.test(label)) return 'VXSE51';
  if (/震源に関する情報/.test(label) && !/震源・震度/.test(label)) return 'VXSE52';
  if (/震源・震度.*情報|遠地地震に関する情報/.test(label)) return 'VXSE53';
  return '';
}

function parseIssuedAt(root: XmlNode, fallback: string | null): string {
  for (const candidate of [firstText(root, 'DateTime'), firstText(root, 'ReportDateTime'), firstText(root, 'TargetDateTime'), fallback || '']) {
    const timestamp = Date.parse(candidate);
    if (candidate && Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function parseEventTime(root: XmlNode): string | null {
  for (const candidate of [
    firstText(root, 'OriginTime'),
    firstText(root, 'OccurrenceTime'),
    firstText(root, 'ArrivalTime'),
    firstText(root, 'TargetDateTime'),
  ]) {
    const timestamp = Date.parse(candidate);
    if (candidate && Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function intensityRank(raw: string): number | null {
  const value = raw.trim().replace(/\s/g, '');
  const labels: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5-': 5, '5弱': 5, '5+': 6, '5強': 6, '6-': 7, '6弱': 7, '6+': 8, '6強': 8, '7': 9 };
  if (labels[value] !== undefined) return labels[value];
  const code = Number(value);
  const codes: Record<number, number> = { 10: 1, 20: 2, 30: 3, 40: 4, 45: 5, 50: 6, 55: 7, 60: 8, 70: 9 };
  return codes[code] ?? null;
}

function intensityLabel(rank: number | null): string | null {
  if (rank === null) return null;
  return ({ 1: '1', 2: '2', 3: '3', 4: '4', 5: '5弱', 6: '5強', 7: '6弱', 8: '6強', 9: '7' } as Record<number, string>)[rank] || null;
}

function parseMagnitude(raw: string): number | null {
  const value = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
}

function parseCoordinate(raw: string, description: string): { latitude: number | null; longitude: number | null; depthKm: number | null } {
  const text = (raw || '').trim().normalize('NFKC');

  // JMA's current decimal-degree ISO 6709 form, e.g. +32.3+130.5-10000/.
  const decimalIso = text.match(/^([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)([+-]\d{1,5})?(?:\/)?$/);
  if (decimalIso) {
    const latitude = Number(decimalIso[1]);
    const longitude = Number(decimalIso[2]);
    const depthKm = decimalIso[3] ? Math.abs(Number(decimalIso[3])) / 1000 : null;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude, depthKm: depthKm !== null && Number.isFinite(depthKm) ? depthKm : null };
    }
  }

  // Older degree-minute-second ISO 6709 form.
  const iso = text.match(/^([+-])(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([+-])(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([+-])(\d{2,5})/);
  if (iso) {
    const lat = Number(iso[2]) + Number(iso[3]) / 60 + Number(iso[4]) / 3600;
    const lon = Number(iso[6]) + Number(iso[7]) / 60 + Number(iso[8]) / 3600;
    const depth = Math.abs(Number(iso[10])) / 1000;
    return { latitude: iso[1] === '-' ? -lat : lat, longitude: iso[5] === '-' ? -lon : lon, depthKm: Number.isFinite(depth) ? depth : null };
  }

  const source = (text + ' ' + (description || '')).normalize('NFKC');
  const latMatch = source.match(/北緯\s*([+-]?\d+(?:\.\d+)?)\s*度?/);
  const lonMatch = source.match(/東経\s*([+-]?\d+(?:\.\d+)?)\s*度?/);
  const depthMatch = source.match(/深さ\s*(\d+(?:\.\d+)?)\s*(?:km|キロ)/i);
  const latitude = latMatch ? Number(latMatch[1]) : null;
  const longitude = lonMatch ? Number(lonMatch[1]) : null;
  return {
    latitude: latitude !== null && Math.abs(latitude) <= 90 ? latitude : null,
    longitude: longitude !== null && Math.abs(longitude) <= 180 ? longitude : null,
    depthKm: depthMatch ? Number(depthMatch[1]) : null,
  };
}

function buildEventKey(root: XmlNode, eventTime: string | null, hypocenter: string | null, magnitude: number | null, sourceId: string): string {
  const eventId = firstText(root, 'EventID');
  if (eventId) return eventId.slice(0, 160);
  // Some early-stage intensity bulletins have no EventID or hypocenter yet.
  // Include the unique feed item ID to avoid collapsing unrelated earthquakes.
  const fallback = [eventTime || '', hypocenter || '', magnitude === null ? '' : String(magnitude), sourceId].join('|');
  return createHash('sha256').update(fallback).digest('hex').slice(0, 40);
}

function parseMessage(entry: FeedEntry, xml: string): ParsedEarthquake | null {
  if (xml.length > MAX_XML_BYTES) throw new Error('気象庁の地震XMLがサイズ上限を超えています。');
  const root = parseXml(xml);
  const control = descendantsNamed(root, 'Control')[0] || root;
  // VXSE product codes are in the Atom item's linked filename, not in the XML
  // Code elements (those are geographic/intensity codes).
  const productCode = resolveProductCode(entry, root, control);
  if (!productCode) return null;

  const controlStatus = childText(control, 'Status');
  if (/訓練|試験/.test(controlStatus)) return null;

  const title = firstText(root, 'Title') || entry.title;
  const headline = firstText(root, 'Headline') || '';
  const issuedAt = parseIssuedAt(root, entry.publishedAt);
  const eventTime = parseEventTime(root);
  const hypocenterNode = descendantsNamed(root, 'Hypocenter')[0];
  const hypocenterName = hypocenterNode ? firstText(hypocenterNode, 'Name') || null : null;
  const coordinateNode = hypocenterNode ? descendantsNamed(hypocenterNode, 'Coordinate')[0] : undefined;
  const coordinate = parseCoordinate(nodeText(coordinateNode), coordinateNode?.attributes.description || '');
  const magnitude = parseMagnitude(firstText(root, 'Magnitude'));

  const maxIntensityRaw = firstText(root, 'MaxInt') || firstText(root, 'MaxIntensity');
  const maxIntensityRank = intensityRank(maxIntensityRaw);
  const maxIntensity = intensityLabel(maxIntensityRank);

  const observedAreas: Array<{ name: string; intensity: string | null; intensityRank: number | null }> = [];
  let kodairaIntensityRank: number | null = null;
  for (const city of descendantsNamed(root, 'City')) {
    const name = firstText(city, 'Name');
    if (!name) continue;
    const raw = firstText(city, 'Intensity') || firstText(city, 'MaxInt');
    const rank = intensityRank(raw);
    if (!observedAreas.some(area => area.name === name)) observedAreas.push({ name, intensity: intensityLabel(rank), intensityRank: rank });
    if (/小平市$/.test(name) && rank !== null) kodairaIntensityRank = Math.max(kodairaIntensityRank ?? 0, rank);
  }
  const kodairaIntensity = intensityLabel(kodairaIntensityRank);

  const infoType = firstText(root, 'InfoType');
  const titleOrKind = title + ' ' + descendantsNamed(root, 'Kind').map(nodeText).join(' ');
  const isEewCancelled = productCode === 'VXSE43' && /取消|取り消し/.test(infoType + ' ' + headline + ' ' + titleOrKind);
  const isEew = productCode === 'VXSE43' && /緊急地震速報/.test(titleOrKind) && !isEewCancelled;

  const eewTargets: string[] = [];
  let kodairaForecastIntensity: string | null = null;
  const addEewTarget = (name: string) => {
    const normalized = name.normalize('NFKC').replace(/\s+/g, '');
    if (normalized && !eewTargets.some(existing => existing.normalize('NFKC').replace(/\s+/g, '') === normalized)) {
      eewTargets.push(name);
    }
  };

  // The Headline contains an Information block whose Areas are the forecast
  // subdivisions. Restrict this to VXSE43 so observed seismic subdivisions in
  // VXSE53 are not accidentally labeled as EEW target areas.
  if (isEew || isEewCancelled) {
    for (const info of descendantsNamed(root, 'Information')) {
      const type = info.attributes.type || '';
      if (!/緊急地震速報/.test(type) || !/細分区域/.test(type)) continue;
      for (const item of childrenNamed(info, 'Item')) {
        const itemKind = childrenNamed(item, 'Kind')[0];
        const currentKindName = childText(itemKind || item, 'Name');
        if (currentKindName && !/緊急地震速報.*警報/.test(currentKindName)) continue;
        for (const area of descendantsNamed(item, 'Area')) {
          addEewTarget(childText(area, 'Name'));
        }
      }
    }

    // The current EEW XML also exposes each predicted area under
    // Body/Intensity/Forecast/Pref/Area, with an area-specific ForecastInt.
    const forecast = descendantsNamed(root, 'Forecast')[0];
    if (forecast) {
      for (const pref of childrenNamed(forecast, 'Pref')) {
        for (const area of childrenNamed(pref, 'Area')) {
          const category = childrenNamed(area, 'Category')[0];
          const kind = category ? childrenNamed(category, 'Kind')[0] : undefined;
          const kindName = childText(kind || area, 'Name');
          if (kindName && !/緊急地震速報.*警報/.test(kindName)) continue;
          const name = childText(area, 'Name');
          addEewTarget(name);
          const normalized = name.normalize('NFKC').replace(/\s+/g, '');
          if (normalized === KODAIRA_EEW_AREA && !kodairaForecastIntensity) {
            const areaForecast = childrenNamed(area, 'ForecastInt')[0];
            kodairaForecastIntensity = childText(areaForecast || area, 'From') || null;
          }
        }
      }
    }
  }

  const eewKodairaTarget = (isEew || isEewCancelled)
    && eewTargets.some(area => area.normalize('NFKC').replace(/\s+/g, '') === KODAIRA_EEW_AREA);
  const globalForecast = descendantsNamed(root, 'Forecast')
    .map(node => childrenNamed(node, 'ForecastInt')[0])
    .map(node => childText(node || root, 'From'))
    .find(Boolean) || firstText(root, 'From');
  const eewForecastIntensity = kodairaForecastIntensity || globalForecast || null;
  const placeText = (hypocenterName || '') + ' ' + headline + ' ' + title;
  const isDistant = descendantsNamed(root, 'Foreign').length > 0 || /海外|中国|ロシア|アメリカ|台湾|トンガ|パプア|フィリピン|インドネシア|南米|太平洋|地中海|メキシコ|チリ|カムチャツカ|マリアナ|バヌアツ/.test(placeText);
  const eventKey = buildEventKey(root, eventTime, hypocenterName, magnitude, entry.id);
  const notificationKind = isEewCancelled && eewKodairaTarget
    ? 'eew_cancelled'
    : isEew && eewKodairaTarget
      ? 'eew_kodaira'
      : kodairaIntensityRank !== null && kodairaIntensityRank >= 2
        ? 'kodaira_intensity2'
        : null;

  return {
    sourceId: entry.id,
    sourceUrl: entry.href,
    productCode,
    title,
    headline,
    issuedAt,
    eventTime,
    eventKey,
    hypocenterName,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    depthKm: coordinate.depthKm,
    magnitude,
    maxIntensity,
    maxIntensityRank,
    kodairaIntensity,
    kodairaIntensityRank,
    observedAreas: observedAreas.slice(0, 100),
    eewTargets,
    eewKodairaTarget,
    eewForecastIntensity,
    isEew,
    isEewCancelled,
    isDistant,
    notificationKind,
  };
}

function stableRetryKey(value: string): string {
  const chars = createHash('sha256').update('campussync-earthquake:' + value).digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function notificationPayload(item: ParsedEarthquake, kind: 'eew_kodaira' | 'kodaira_intensity2' | 'eew_cancelled'): EarthquakeNotificationPayload {
  return {
    kind,
    eventTime: item.eventTime || item.issuedAt,
    issuedAt: item.issuedAt,
    hypocenterName: item.hypocenterName || '震源情報確認中',
    magnitude: item.magnitude,
    depthKm: item.depthKm,
    latitude: item.latitude,
    longitude: item.longitude,
    maxIntensity: item.maxIntensity,
    kodairaIntensity: item.kodairaIntensity,
    eewTargets: item.eewTargets,
    eewForecastIntensity: item.eewForecastIntensity,
    sourceUrl: item.sourceUrl,
  };
}

async function saveMessage(admin: SupabaseClient, mode: 'high' | 'long', item: ParsedEarthquake): Promise<boolean> {
  const { data: existingReport, error: reportLookupError } = await admin.from('jma_earthquake_reports')
    .select('source_id').eq('source_id', item.sourceId).maybeSingle();
  if (reportLookupError) throw reportLookupError;
  if (existingReport) return false;

  const { data: current, error: currentError } = await admin.from('jma_earthquakes')
    .select('*').eq('event_key', item.eventKey).maybeSingle();
  if (currentError) throw currentError;

  const merged = {
    event_key: item.eventKey,
    latest_source_id: item.sourceId,
    latest_source_url: item.sourceUrl,
    product_code: item.productCode,
    title: item.title,
    headline: item.headline,
    issued_at: item.issuedAt,
    event_time: item.eventTime || current?.event_time || null,
    hypocenter_name: item.hypocenterName || current?.hypocenter_name || null,
    latitude: item.latitude ?? current?.latitude ?? null,
    longitude: item.longitude ?? current?.longitude ?? null,
    depth_km: item.depthKm ?? current?.depth_km ?? null,
    magnitude: item.magnitude ?? current?.magnitude ?? null,
    max_intensity: item.maxIntensity || current?.max_intensity || null,
    max_intensity_rank: item.maxIntensityRank ?? current?.max_intensity_rank ?? null,
    kodaira_intensity: item.kodairaIntensity || current?.kodaira_intensity || null,
    kodaira_intensity_rank: item.kodairaIntensityRank ?? current?.kodaira_intensity_rank ?? null,
    observed_areas: item.observedAreas.length ? item.observedAreas : (current?.observed_areas || []),
    eew_targets: item.eewTargets.length ? item.eewTargets : (current?.eew_targets || []),
    eew_kodaira_target: item.eewKodairaTarget || current?.eew_kodaira_target || false,
    eew_forecast_intensity: item.eewForecastIntensity || current?.eew_forecast_intensity || null,
    is_eew: item.isEew || current?.is_eew || false,
    is_eew_cancelled: item.isEewCancelled ? true : item.isEew ? false : (current?.is_eew_cancelled || false),
    is_distant: item.isDistant || current?.is_distant || false,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertError } = await admin.from('jma_earthquakes').upsert(merged, { onConflict: 'event_key' });
  if (upsertError) throw upsertError;

  // Preserve the outbox before marking the XML report as processed. If the
  // notification insert fails, the report remains eligible for retry on the
  // next high-frequency feed poll.
  const resolvedNotificationKind = item.isEewCancelled && current?.eew_kodaira_target
    ? 'eew_cancelled'
    : item.notificationKind;
  if (resolvedNotificationKind && mode === 'high') {
    const kind = resolvedNotificationKind;
    const notificationItem: ParsedEarthquake = {
      ...item,
      eventTime: item.eventTime || current?.event_time || null,
      hypocenterName: item.hypocenterName || current?.hypocenter_name || null,
      magnitude: item.magnitude ?? (current?.magnitude === null || current?.magnitude === undefined ? null : Number(current.magnitude)),
      depthKm: item.depthKm ?? (current?.depth_km === null || current?.depth_km === undefined ? null : Number(current.depth_km)),
      latitude: item.latitude ?? (current?.latitude === null || current?.latitude === undefined ? null : Number(current.latitude)),
      longitude: item.longitude ?? (current?.longitude === null || current?.longitude === undefined ? null : Number(current.longitude)),
      maxIntensity: item.maxIntensity || current?.max_intensity || null,
      kodairaIntensity: item.kodairaIntensity || current?.kodaira_intensity || null,
      eewTargets: item.eewTargets.length ? item.eewTargets : (Array.isArray(current?.eew_targets) ? current.eew_targets : []),
      eewForecastIntensity: item.eewForecastIntensity || current?.eew_forecast_intensity || null,
    };
    const payload = notificationPayload(notificationItem, kind);
    const { error: notificationError } = await admin.from('jma_earthquake_notifications').upsert({
      event_key: item.eventKey,
      notification_kind: kind,
      payload,
    }, { onConflict: 'event_key,notification_kind', ignoreDuplicates: true });
    if (notificationError) throw notificationError;
  }

  const { error: reportError } = await admin.from('jma_earthquake_reports').insert({
    source_id: item.sourceId,
    event_key: item.eventKey,
    feed_mode: mode,
    product_code: item.productCode,
    title: item.title,
    source_url: item.sourceUrl,
    issued_at: item.issuedAt,
    fetched_at: new Date().toISOString(),
  });
  if (reportError && reportError.code !== '23505') throw reportError;
  return true;
}

async function dispatchNotifications(admin: SupabaseClient) {
  const { data: pending, error } = await admin.from('jma_earthquake_notifications')
    .select('id,event_key,notification_kind,payload,official_sent_at,groups_sent_at')
    .or('official_sent_at.is.null,groups_sent_at.is.null')
    .order('created_at', { ascending: true })
    .limit(8);
  if (error) throw error;
  if (!pending?.length) return { pending: 0, attempted: 0, completed: 0 };

  const bot = await getActiveLineBot();
  if (!bot?.accessToken) return { pending: pending.length, attempted: 0, completed: 0, skipped: '有効なLINE公式アカウントが設定されていません。' };

  let attempted = 0;
  let completed = 0;
  for (const item of pending as Array<{ id: number; event_key: string; notification_kind: string; payload: EarthquakeNotificationPayload; official_sent_at: string | null; groups_sent_at: string | null }>) {
    attempted += 1;
    const flex = buildLineEarthquakeFlex(item.payload);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { last_attempt_at: now };
    const failures: string[] = [];

    if (!item.official_sent_at) {
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + bot.accessToken,
            'Content-Type': 'application/json',
            'X-Line-Retry-Key': stableRetryKey(item.event_key + ':' + item.notification_kind + ':official'),
          },
          body: JSON.stringify({ messages: [flex] }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        patch.official_http_status = response.status;
        if (response.ok || response.status === 409) patch.official_sent_at = now;
        else failures.push('公式アカウント HTTP ' + response.status + '：' + (await response.text().catch(() => '')).slice(0, 180));
      } catch (caught) {
        failures.push('公式アカウント通信エラー：' + (caught instanceof Error ? caught.message : 'unknown'));
      }
    }

    if (!item.groups_sent_at) {
      try {
        const groupResult = await pushLineMessagesToRegisteredChats(
          bot.accessToken,
          [flex],
          stableRetryKey(item.event_key + ':' + item.notification_kind + ':groups'),
          'earthquake_alert',
        );
        patch.groups_result = groupResult;
        if (!groupResult.lookupError && groupResult.failed === 0) patch.groups_sent_at = now;
        else failures.push(groupResult.lookupError || ('グループ配信 ' + groupResult.sent + '/' + groupResult.registered + '件'));
      } catch (caught) {
        failures.push('グループ配信エラー：' + (caught instanceof Error ? caught.message : 'unknown'));
      }
    }

    patch.last_error = failures.length ? failures.join(' / ').slice(0, 1000) : null;
    const { error: updateError } = await admin.from('jma_earthquake_notifications').update(patch).eq('id', item.id);
    if (updateError) console.error('地震LINE通知状態の保存に失敗:', updateError.message);
    if (!failures.length) completed += 1;
  }

  return { pending: pending.length, attempted, completed };
}

async function acquireLock(admin: SupabaseClient, mode: 'high' | 'long'): Promise<string | null> {
  const token = randomUUID();
  const now = new Date().toISOString();
  const lockTokenColumn = mode === 'high' ? 'high_lock_token' : 'long_lock_token';
  const lockExpiresColumn = mode === 'high' ? 'high_lock_expires_at' : 'long_lock_expires_at';
  const durationMs = mode === 'high' ? 75_000 : 5 * 60_000;
  const expires = new Date(Date.now() + durationMs).toISOString();
  const patch: Record<string, unknown> = {
    [lockTokenColumn]: token,
    [lockExpiresColumn]: expires,
    last_attempt_at: now,
  };
  const { data, error } = await admin.from('jma_earthquake_sync_state')
    .update(patch)
    .eq('id', 1)
    .or(lockExpiresColumn + '.is.null,' + lockExpiresColumn + '.lt.' + now)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data ? token : null;
}

async function syncFeed(admin: SupabaseClient, mode: 'high' | 'long') {
  const feedUrl = mode === 'high' ? HIGH_FEED_URL : LONG_FEED_URL;
  const feedXml = await fetchText(feedUrl, 12000, MAX_FEED_BYTES);
  const entries = parseFeed(feedXml, feedUrl)
    .filter(entry => {
      const published = entry.publishedAt ? Date.parse(entry.publishedAt) : 0;
      // Undated feed items stay with the high-frequency path. The long feed
      // only backfills items older than the realtime window.
      if (!published) return mode === 'high';
      const age = Date.now() - published;
      return mode === 'high'
        ? age <= 30 * 60 * 1000
        : age > 30 * 60 * 1000 && age <= 5 * 24 * 60 * 60 * 1000;
    })
    .sort((a, b) => Date.parse(a.publishedAt || '') - Date.parse(b.publishedAt || ''))
    .slice(-MAX_FEED_ITEMS);

  const { data: knownRows, error: knownError } = entries.length
    ? await admin.from('jma_earthquake_reports').select('source_id').in('source_id', entries.map(entry => entry.id))
    : { data: [], error: null };
  if (knownError) throw knownError;
  const known = new Set((knownRows || []).map((row: { source_id: string }) => row.source_id));
  const pendingEntries = entries.filter(entry => !known.has(entry.id));
  const batchEntries = mode === 'long'
    ? pendingEntries.slice(0, MAX_LONG_BATCH_ITEMS)
    : pendingEntries;

  let downloaded = 0;
  let saved = 0;
  let failures = 0;

  for (let index = 0; index < batchEntries.length; index += 4) {
    const chunk = batchEntries.slice(index, index + 4);
    const results = await Promise.all(chunk.map(async entry => {
      try {
        const xml = await fetchText(entry.href, 10000, MAX_XML_BYTES);
        return { entry, parsed: parseMessage(entry, xml) };
      } catch (caught) {
        console.error('JMA earthquake XML fetch failed:', entry.id, caught instanceof Error ? caught.message : 'unknown');
        failures += 1;
        return null;
      }
    }));
    for (const result of results) {
      if (!result?.parsed) continue;
      downloaded += 1;
      if (await saveMessage(admin, mode, result.parsed)) saved += 1;
    }
  }
  if (failures > 0) throw new Error('気象庁の地震情報を一部取得できませんでした。次回同期で再試行します。');

  const remainingEntries = Math.max(0, pendingEntries.length - batchEntries.length);
  const now = new Date().toISOString();
  const patch = mode === 'high'
    ? { high_last_success_at: now, last_error: null, updated_at: now }
    : { long_last_success_at: now, last_error: null, updated_at: now };
  const { error: stateError } = await admin.from('jma_earthquake_sync_state').update(patch).eq('id', 1);
  if (stateError) throw stateError;

  // The high-frequency feed is the only source allowed to create and dispatch
  // realtime LINE alerts. The long feed is strictly for historical display.
  const notifications = mode === 'high'
    ? await dispatchNotifications(admin)
    : { pending: 0, attempted: 0, completed: 0, skipped: 'historical_feed_no_dispatch' };
  return {
    mode,
    entries: entries.length,
    newEntries: pendingEntries.length,
    batchEntries: batchEntries.length,
    downloaded,
    saved,
    remainingEntries,
    notifications,
    syncedAt: now,
  };
}

export async function GET() {
  try {
    const admin = getAdmin();
    const [eventsResult, syncResult] = await Promise.all([
      admin.from('jma_earthquakes')
        .select('event_key,latest_source_url,product_code,title,headline,issued_at,event_time,hypocenter_name,latitude,longitude,depth_km,magnitude,max_intensity,max_intensity_rank,kodaira_intensity,kodaira_intensity_rank,observed_areas,eew_targets,eew_kodaira_target,eew_forecast_intensity,is_eew,is_eew_cancelled,is_distant,updated_at')
        .order('event_time', { ascending: false, nullsFirst: false })
        .limit(60),
      admin.from('jma_earthquake_sync_state')
        .select('high_last_success_at,long_last_success_at,last_attempt_at,last_error')
        .eq('id', 1)
        .maybeSingle(),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (syncResult.error) throw syncResult.error;
    const highAt = syncResult.data?.high_last_success_at || null;
    const stale = !highAt || Date.now() - Date.parse(highAt) > 5 * 60 * 1000;
    return NextResponse.json({
      events: eventsResult.data || [],
      sync: {
        highLastSuccessAt: highAt,
        longLastSuccessAt: syncResult.data?.long_last_success_at || null,
        lastAttemptAt: syncResult.data?.last_attempt_at || null,
        lastError: syncResult.data?.last_error || null,
        stale,
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (caught) {
    console.error('Earthquake API GET failed:', caught instanceof Error ? caught.message : 'unknown');
    return NextResponse.json({ message: caught instanceof Error ? caught.message : '地震情報を取得できませんでした。' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  let admin: SupabaseClient;
  try {
    admin = getAdmin();
  } catch (caught) {
    return NextResponse.json({ success: false, message: caught instanceof Error ? caught.message : '設定エラー' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const mode: 'high' | 'long' = body?.mode === 'long' ? 'long' : 'high';
  let lockToken: string | null = null;
  try {
    lockToken = await acquireLock(admin, mode);
    if (!lockToken) return NextResponse.json({ success: true, skipped: true, mode, message: '別の地震同期が実行中のため、重複同期をスキップしました。' });

    const result = await syncFeed(admin, mode);
    return NextResponse.json({ success: true, ...result });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '地震情報同期に失敗しました。';
    console.error('JMA earthquake sync failed:', message);
    await admin.from('jma_earthquake_sync_state').update({ last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', 1);
    return NextResponse.json({ success: false, mode, message }, { status: 500 });
  } finally {
    if (lockToken) {
      const lockTokenColumn = mode === 'high' ? 'high_lock_token' : 'long_lock_token';
      const lockExpiresColumn = mode === 'high' ? 'high_lock_expires_at' : 'long_lock_expires_at';
      const unlockPatch: Record<string, unknown> = {
        [lockTokenColumn]: null,
        [lockExpiresColumn]: null,
        updated_at: new Date().toISOString(),
      };
      await admin.from('jma_earthquake_sync_state')
        .update(unlockPatch)
        .eq('id', 1)
        .eq(lockTokenColumn, lockToken);
    }
  }
}
