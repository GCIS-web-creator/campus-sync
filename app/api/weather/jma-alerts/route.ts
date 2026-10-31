import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { pushLineMessagesToRegisteredChats } from '@/lib/line-group-chats';
import { buildJmaWeatherAlertFlex, type JmaWeatherAlertNotificationPayload } from '@/lib/line-weather-alert-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HIGH_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml';
const LONG_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml';
const HIGH_REGULAR_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/regular.xml';
const LONG_REGULAR_FEED_URL = 'https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml';
const JMA_WARNING_CODES = new Set(['VPWW55', 'VPWW56', 'VPWW57', 'VPWW58', 'VPWW59', 'VPWW60', 'VPWW61', 'VPWS50']);
const MAX_XML_BYTES = 3 * 1024 * 1024;
const MAX_FEED_BYTES = 16 * 1024 * 1024;
const MAX_FEED_ITEMS = 150;

type XmlNode = { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string };
type FeedEntry = { id: string; title: string; href: string; publishedAt: string | null };
type ParsedKind = { code: string | null; name: string; status: string; details: string; family: string; severity: number; active: boolean };
type ParsedArea = { areaKey: string; areaName: string; kinds: ParsedKind[] };
type ParsedMessage = {
  productCode: string;
  title: string;
  headline: string;
  publishingOffice: string;
  issuedAt: string;
  targetAreas: ParsedArea[];
  rawXml: string;
};

const FAMILY_BY_PRODUCT: Record<string, string> = {
  VPWW55: 'heavy-rain',
  VPWW56: 'landslide',
  VPWW57: 'storm-surge',
  VPWW58: 'wind',
  VPWW59: 'waves',
  VPWW60: 'heavy-snow',
  VPWW61: 'other',
};

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

function firstDescendantText(node: XmlNode, name: string): string {
  return nodeText(descendantsNamed(node, name)[0]);
}

function parseFeed(xml: string, feedUrl: string): FeedEntry[] {
  const root = parseXml(xml);
  return descendantsNamed(root, 'entry').map(entry => {
    const linkNodes = childrenNamed(entry, 'link');
    const bestLink = linkNodes.find(link => /xml/i.test(link.attributes.type || '') || /alternate/i.test(link.attributes.rel || '')) || linkNodes[0];
    const entryId = childText(entry, 'id');
    const rawHref = bestLink?.attributes.href || entryId || '';
    let href = '';
    try {
      const resolved = new URL(rawHref, feedUrl);
      if (resolved.protocol === 'https:' && (resolved.hostname === 'www.data.jma.go.jp' || resolved.hostname === 'xml.kishou.go.jp')) {
        href = resolved.toString();
      }
    } catch {
      href = '';
    }
    return {
      id: entryId || href,
      title: childText(entry, 'title'),
      href,
      publishedAt: childText(entry, 'updated') || childText(entry, 'published') || null,
    };
  }).filter(entry => entry.id && entry.href && /警報|注意報|集約通報|大雨|土砂災害|高潮|暴風|暴風雪|波浪|大雪/.test(entry.title));
}

function parseSeverity(name: string, status: string): number {
  const value = name + ' ' + status;
  if (/特別警報|レベル\s*5|レベル５/.test(value)) return 5;
  if (/危険警報|レベル\s*4|レベル４/.test(value)) return 4;
  if (/警報|レベル\s*3|レベル３/.test(value)) return 3;
  if (/注意報|レベル\s*2|レベル２/.test(value)) return 2;
  return 0;
}

function familyForKind(name: string, productCode: string): string {
  if (FAMILY_BY_PRODUCT[productCode]) return FAMILY_BY_PRODUCT[productCode];
  if (/土砂/.test(name)) return 'landslide';
  if (/高潮/.test(name)) return 'storm-surge';
  if (/暴風|強風|風雪/.test(name)) return 'wind';
  if (/波浪/.test(name)) return 'waves';
  if (/大雪|着雪|なだれ|融雪/.test(name)) return 'heavy-snow';
  if (/大雨|浸水/.test(name)) return 'heavy-rain';
  return 'other';
}

function parseIssuedAt(root: XmlNode, fallback: string | null): string {
  for (const candidate of [
    firstDescendantText(root, 'DateTime'),
    firstDescendantText(root, 'ReportDateTime'),
    firstDescendantText(root, 'TargetDateTime'),
    fallback || '',
  ]) {
    const time = Date.parse(candidate);
    if (candidate && Number.isFinite(time)) return new Date(time).toISOString();
  }
  return new Date().toISOString();
}

function parseMessage(xml: string, fallbackTitle: string, fallbackTime: string | null): ParsedMessage | null {
  const root = parseXml(xml);
  const productCode = descendantsNamed(root, 'code').map(nodeText).find(value => /^VPW[WS]\d{2}$/.test(value)) || '';
  if (!JMA_WARNING_CODES.has(productCode)) return null;

  const controlNode = descendantsNamed(root, 'Control')[0] || root;
  const controlStatus = childText(controlNode, 'Status');
  if (controlStatus === '訓練' || controlStatus === '試験') return null;

  const title = firstDescendantText(root, 'Title') || fallbackTitle;
  const headline = firstDescendantText(root, 'Headline') || '';
  const publishingOffice = firstDescendantText(root, 'PublishingOffice') || firstDescendantText(root, 'EditorialOffice');
  const issuedAt = parseIssuedAt(root, fallbackTime);
  const warningNodes = descendantsNamed(root, 'warning').filter(node => /市町村等/.test(node.attributes.type || ''));
  const targetAreas: ParsedArea[] = [];

  for (const warning of warningNodes) {
    for (const item of childrenNamed(warning, 'item')) {
      const areaNode = childrenNamed(item, 'area')[0];
      const areaName = childText(areaNode || item, 'Name');
      let areaKey = '';
      let displayName = '';
      if (areaName === '小平市') {
        areaKey = 'kodaira';
        displayName = '小平市（多摩北部）';
      } else if (areaName === '多摩北部') {
        areaKey = 'tama-north';
        displayName = '多摩北部';
      }
      if (!areaKey) continue;

      const kinds: ParsedKind[] = [];
      for (const kind of childrenNamed(item, 'kind')) {
        const name = childText(kind, 'Name');
        const status = childText(kind, 'Status');
        if (!name || !status || /発表警報・注意報はなし|発表なし|解除/.test(status)) continue;
        const family = familyForKind(name, productCode);
        const condition = childText(kind, 'Condition');
        const additions = childrenNamed(kind, 'additions').map(nodeText).filter(Boolean).join('、');
        kinds.push({
          code: childText(kind, 'Code') || null,
          name,
          status,
          details: [condition, additions].filter(Boolean).join(' ・ '),
          family,
          severity: parseSeverity(name, status),
          active: true,
        });
      }
      targetAreas.push({ areaKey, areaName: displayName, kinds });
    }
  }

  return { productCode, title, headline, publishingOffice, issuedAt, targetAreas, rawXml: xml };
}

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabaseサーバー環境変数が未設定です。');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function fetchText(url: string, timeoutMs: number, sizeLimit = MAX_XML_BYTES): Promise<string> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'CampusSync-JMA-Weather-Alerts/1.0' },
  });
  if (!response.ok) throw new Error('気象庁XML取得 HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > sizeLimit) throw new Error('気象庁XMLが上限サイズを超えています。');
  const decoded = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  if (decoded.byteLength > sizeLimit) throw new Error('展開後の気象庁XMLが上限サイズを超えています。');
  return new TextDecoder('utf-8').decode(decoded);
}

async function existingSourceIds(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await admin.from('jma_weather_alert_events').select('source_id').in('source_id', ids);
  if (error) throw error;
  return new Set((data || []).map((row: { source_id: string }) => row.source_id));
}

async function downloadEntries(entries: FeedEntry[]): Promise<{ downloaded: Array<{ entry: FeedEntry; message: ParsedMessage }>; failures: number; skipped: Array<{ title: string; productCode: string | null }> }> {
  const downloaded: Array<{ entry: FeedEntry; message: ParsedMessage }> = [];
  let failures = 0;
  const skipped: Array<{ title: string; productCode: string | null }> = [];
  for (let index = 0; index < entries.length; index += 5) {
    const chunk = entries.slice(index, index + 5);
    const results = await Promise.all(chunk.map(async entry => {
      try {
        const xml = await fetchText(entry.href, 10000);
        const message = parseMessage(xml, entry.title, entry.publishedAt);
        if (!message) {
          const productCode = xml.match(/VPW[WS]\d{2}/)?.[0] || null;
          skipped.push({ title: entry.title, productCode });
          return null;
        }
        return { entry, message };
      } catch (error) {
        failures += 1;
        console.error('JMA message download failed:', entry.id, error instanceof Error ? error.message : 'unknown');
        return null;
      }
    }));
    for (const result of results) if (result) downloaded.push(result);
  }
  downloaded.sort((a, b) => Date.parse(a.message.issuedAt) - Date.parse(b.message.issuedAt));
  return { downloaded, failures, skipped };
}

async function latestIssuedAt(admin: SupabaseClient, areaKey: string, family?: string): Promise<number> {
  let query = admin.from('jma_weather_alerts').select('issued_at').eq('area_key', areaKey).not('issued_at', 'is', null);
  if (family) query = query.eq('alert_family', family);
  const { data, error } = await query.order('issued_at', { ascending: false }).limit(1);
  if (error) throw error;
  const value = (data || [])[0]?.issued_at;
  return value ? Date.parse(value) : 0;
}

async function applyMessageState(admin: SupabaseClient, entry: FeedEntry, message: ParsedMessage): Promise<unknown[]> {
  const now = new Date().toISOString();
  const saved: unknown[] = [];
  const isAggregate = message.productCode === 'VPWS50';

  for (const area of message.targetAreas) {
    const currentTime = Date.parse(message.issuedAt);
    const family = FAMILY_BY_PRODUCT[message.productCode];
    const latest = await latestIssuedAt(admin, area.areaKey, isAggregate ? undefined : family);
    if (latest > currentTime) continue;

    let clearQuery = admin.from('jma_weather_alerts')
      .update({ active: false, status: '解除・更新', issued_at: message.issuedAt, updated_at: now })
      .eq('area_key', area.areaKey)
      .eq('active', true);
    if (!isAggregate) clearQuery = clearQuery.eq('alert_family', family);
    const { error: clearError } = await clearQuery;
    if (clearError) throw clearError;

    const rows = area.kinds.filter(kind => kind.active && kind.severity > 0).map(kind => ({
      area_key: area.areaKey,
      area_name: area.areaName,
      alert_key: kind.family + ':' + (kind.code || kind.name.replace(/\s+/g, '_')),
      alert_code: kind.code,
      alert_name: kind.name,
      alert_family: kind.family,
      severity: kind.severity,
      status: kind.status,
      active: true,
      details: kind.details || null,
      issued_at: message.issuedAt,
      source_product_code: message.productCode,
      source_id: entry.id,
      source_url: entry.href,
      updated_at: now,
    }));
    if (rows.length) {
      const { error } = await admin.from('jma_weather_alerts').upsert(rows, { onConflict: 'area_key,alert_key' });
      if (error) throw error;
      saved.push(...rows);
    }
  }
  return saved;
}

async function storeEvent(
  admin: SupabaseClient,
  feedMode: 'high' | 'long',
  entry: FeedEntry,
  message: ParsedMessage,
  parsedAlerts: unknown[],
  notificationPayload: JmaWeatherAlertNotificationPayload | null,
): Promise<void> {
  const { error } = await admin.from('jma_weather_alert_events').upsert({
    source_id: entry.id,
    feed_mode: feedMode,
    source_url: entry.href,
    product_code: message.productCode,
    title: message.title,
    headline: message.headline,
    publishing_office: message.publishingOffice || null,
    issued_at: message.issuedAt,
    target_areas: message.targetAreas.map(area => area.areaName),
    parsed_alerts: parsedAlerts,
    raw_xml: message.rawXml.length <= MAX_XML_BYTES ? message.rawXml : null,
    notification_payload: notificationPayload,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'source_id', ignoreDuplicates: true });
  if (error) throw error;
}

function alertKeyForKind(kind: ParsedKind): string {
  return kind.family + ':' + (kind.code || kind.name.replace(/\\s+/g, '_'));
}

async function findNewKodairaWarningNotification(
  admin: SupabaseClient,
  message: ParsedMessage,
): Promise<JmaWeatherAlertNotificationPayload | null> {
  const kodaira = message.targetAreas.find(area => area.areaKey === 'kodaira');
  if (!kodaira) return null;

  // 「警報」「特別警報」だけを対象にし、注意報（severity 2）は通知しない。
  const candidates = kodaira.kinds.filter(kind =>
    kind.active && kind.severity >= 3 && /警報/.test(kind.name)
  );
  if (!candidates.length) return null;

  const family = message.productCode === 'VPWS50' ? undefined : FAMILY_BY_PRODUCT[message.productCode];
  const latest = await latestIssuedAt(admin, 'kodaira', family);
  if (latest > Date.parse(message.issuedAt)) return null;

  const keys = [...new Set(candidates.map(alertKeyForKind))];
  const { data, error } = await admin.from('jma_weather_alerts')
    .select('alert_key,severity,active')
    .eq('area_key', 'kodaira')
    .in('alert_key', keys);
  if (error) throw error;

  const previous = new Map((data || []).map((row: { alert_key: string; severity: number; active: boolean }) =>
    [row.alert_key, row]
  ));
  const newlyIssued = candidates.filter(kind => {
    const old = previous.get(alertKeyForKind(kind));
    return !old || !old.active || Number(old.severity) < kind.severity;
  });
  if (!newlyIssued.length) return null;

  return {
    areaName: '小平市',
    issuedAt: message.issuedAt,
    severity: Math.max(...newlyIssued.map(kind => kind.severity)),
    alerts: newlyIssued.map(kind => ({
      name: kind.name,
      status: kind.status,
      details: kind.details || '',
    })),
  };
}

function stableLineRetryUuid(value: string): string {
  const chars = createHash('sha256').update('campussync-jma-alert:' + value)
    .digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
    + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

async function dispatchPendingKodairaWarnings(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await admin.from('jma_weather_alert_events')
    .select('source_id,notification_payload,official_sent_at,groups_sent_at')
    .not('notification_payload', 'is', null)
    .or('official_sent_at.is.null,groups_sent_at.is.null')
    .order('fetched_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  const pending = (data || []) as Array<{
    source_id: string;
    notification_payload: JmaWeatherAlertNotificationPayload;
    official_sent_at: string | null;
    groups_sent_at: string | null;
  }>;
  if (!pending.length) return { pending: 0, attempted: 0, completed: 0 };

  const bot = await getActiveLineBot();
  if (!bot?.accessToken) {
    return { pending: pending.length, attempted: 0, completed: 0, skipped: '有効なLINE公式アカウントのアクセストークンがありません。' };
  }

  let completed = 0;
  let attempted = 0;
  let failed = 0;

  for (const item of pending) {
    attempted += 1;
    const flex = buildJmaWeatherAlertFlex(item.notification_payload);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { notification_last_attempt_at: now };
    const failures: string[] = [];

    if (!item.official_sent_at) {
      try {
        const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + bot.accessToken,
            'Content-Type': 'application/json',
            'X-Line-Retry-Key': stableLineRetryUuid(item.source_id + ':official'),
          },
          body: JSON.stringify({ messages: [flex] }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        });
        patch.official_http_status = response.status;
        if (response.ok || response.status === 409) {
          patch.official_sent_at = now;
        } else {
          const body = await response.text().catch(() => '');
          failures.push('公式アカウント HTTP ' + response.status + (body ? '：' + body.slice(0, 220) : ''));
        }
      } catch (caught) {
        failures.push('公式アカウント通信エラー：' + (caught instanceof Error ? caught.message : 'unknown'));
      }
    }

    if (!item.groups_sent_at) {
      try {
        const groupResult = await pushLineMessagesToRegisteredChats(
          bot.accessToken,
          [flex],
          stableLineRetryUuid(item.source_id + ':groups'),
          'weather_alert',
        );
        patch.groups_result = groupResult;
        if (groupResult.lookupError || groupResult.failed > 0) {
          failures.push(groupResult.lookupError || ('グループ送信 ' + groupResult.sent + '/' + groupResult.registered + '件成功'));
        } else {
          // 登録先が0件の場合も、この警報に対する配信処理は完了として記録する。
          patch.groups_sent_at = now;
        }
      } catch (caught) {
        failures.push('グループ送信エラー：' + (caught instanceof Error ? caught.message : 'unknown'));
      }
    }

    patch.notification_last_error = failures.length ? failures.join(' / ').slice(0, 1000) : null;
    const { error: updateError } = await admin.from('jma_weather_alert_events')
      .update(patch)
      .eq('source_id', item.source_id);
    if (updateError) {
      failed += 1;
      console.error('JMA警報通知の送信状態を保存できません:', updateError.message);
      continue;
    }
    if (failures.length) failed += 1;
    else completed += 1;
  }

  return { pending: pending.length, attempted, completed, failed };
}

async function syncFeed(admin: SupabaseClient, mode: 'high' | 'long'): Promise<Record<string, unknown>> {
  const fetchedAt = new Date().toISOString();
  // VPWS50 is a scheduled aggregate bulletin, so regular feeds are checked first.
  // extra feeds are checked afterwards for immediate per-phenomenon updates.
  const feedUrls = mode === 'high'
    ? [HIGH_REGULAR_FEED_URL, HIGH_FEED_URL]
    : [LONG_REGULAR_FEED_URL, LONG_FEED_URL];

  let totalFeedEntries = 0;
  let totalNewEntries = 0;
  let totalProcessed = 0;
  let totalSavedAlerts = 0;
  let latestAggregateAt: string | null = null;
  const feedDiagnostics: Array<Record<string, unknown>> = [];

  for (const feedUrl of feedUrls) {
    const feedXml = await fetchText(feedUrl, 15000, MAX_FEED_BYTES);
    const allEntries = parseFeed(feedXml, feedUrl)
      .sort((a, b) => Date.parse(a.publishedAt || '') - Date.parse(b.publishedAt || ''));
    const latestAggregateEntry = [...allEntries].reverse().find(entry => /集約通報/.test(entry.title));
    const aggregateFeedTime = latestAggregateEntry?.publishedAt ? Date.parse(latestAggregateEntry.publishedAt) : 0;
    const candidateEntries = (latestAggregateEntry && aggregateFeedTime
      ? allEntries.filter(entry => entry.id === latestAggregateEntry.id || Date.parse(entry.publishedAt || '') >= aggregateFeedTime)
      : allEntries.filter(entry => {
          const publishedAt = entry.publishedAt ? Date.parse(entry.publishedAt) : 0;
          return publishedAt > 0 && Date.now() - publishedAt <= (mode === 'high' ? 20 : 180) * 60 * 1000;
        })
    ).slice(-MAX_FEED_ITEMS);

    const known = await existingSourceIds(admin, candidateEntries.map(entry => entry.id));
    const downloadResult = await downloadEntries(candidateEntries.filter(entry => !known.has(entry.id)));
    if (downloadResult.failures > 0) {
      throw new Error('気象庁の個別XMLを一部取得できませんでした。次回同期で再試行します。');
    }
    const downloaded = downloadResult.downloaded;
    const aggregateEntries = downloaded.filter(item => item.message.productCode === 'VPWS50');
    const latestAggregate = [...aggregateEntries].sort((a, b) => Date.parse(b.message.issuedAt) - Date.parse(a.message.issuedAt))[0];
    if (latestAggregate && (!latestAggregateAt || Date.parse(latestAggregate.message.issuedAt) > Date.parse(latestAggregateAt))) {
      latestAggregateAt = latestAggregate.message.issuedAt;
    }
    const latestAggregateTime = latestAggregate ? Date.parse(latestAggregate.message.issuedAt) : 0;
    const relevant = latestAggregate
      ? downloaded.filter(item => item === latestAggregate || (item.message.productCode !== 'VPWS50' && Date.parse(item.message.issuedAt) >= latestAggregateTime))
      : downloaded.filter(item => Date.now() - Date.parse(item.message.issuedAt) <= (mode === 'high' ? 20 : 180) * 60 * 1000);
    relevant.sort((a, b) => Date.parse(a.message.issuedAt) - Date.parse(b.message.issuedAt));

    let processed = 0;
    let savedAlerts = 0;
    for (const item of relevant) {
      const notificationPayload = await findNewKodairaWarningNotification(admin, item.message);
      const parsedAlerts = await applyMessageState(admin, item.entry, item.message);
      await storeEvent(admin, mode, item.entry, item.message, parsedAlerts, notificationPayload);
      processed += 1;
      savedAlerts += parsedAlerts.length;
    }

    totalFeedEntries += allEntries.length;
    totalNewEntries += downloaded.length;
    totalProcessed += processed;
    totalSavedAlerts += savedAlerts;
    feedDiagnostics.push({
      feed: new URL(feedUrl).pathname.split('/').pop(),
      feedEntries: allEntries.length,
      candidateCount: candidateEntries.length,
      knownCount: known.size,
      attemptedCount: candidateEntries.length - known.size,
      parsedCount: downloaded.length,
      parseSkippedCount: downloadResult.skipped.length,
      parseSkippedSamples: downloadResult.skipped.slice(0, 5),
      newestFeedEntries: allEntries.slice(-5).map(entry => ({
        title: entry.title,
        updatedAt: entry.publishedAt,
        hasXmlUrl: Boolean(entry.href),
        id: entry.id,
      })),
      latestAggregateFeedTitle: latestAggregateEntry?.title || null,
      latestAggregateFeedUpdatedAt: latestAggregateEntry?.publishedAt || null,
      latestAggregateAt: latestAggregate?.message.issuedAt || null,
    });
  }

  const stateUpdate = mode === 'high'
    ? { high_last_success_at: fetchedAt, last_success_at: fetchedAt, last_attempt_at: fetchedAt, last_error: null, updated_at: fetchedAt }
    : { long_last_success_at: fetchedAt, last_success_at: fetchedAt, last_attempt_at: fetchedAt, last_error: null, updated_at: fetchedAt };
  const { error: stateError } = await admin.from('jma_weather_sync_state').update(stateUpdate).eq('id', 1);
  if (stateError) throw stateError;

  let notificationDelivery: Record<string, unknown> = { pending: 0, attempted: 0, completed: 0 };
  try {
    notificationDelivery = await dispatchPendingKodairaWarnings(admin);
  } catch (error) {
    notificationDelivery = { error: error instanceof Error ? error.message : '警報通知の処理に失敗しました。' };
    console.error('JMA警報通知の処理に失敗:', error instanceof Error ? error.message : 'unknown');
  }

  return {
    mode,
    feedEntries: totalFeedEntries,
    newEntries: totalNewEntries,
    processed: totalProcessed,
    savedAlerts: totalSavedAlerts,
    latestAggregateAt,
    notificationDelivery,
    diagnostics: { feeds: feedDiagnostics },
  };
}

const SYNC_LOCK_TTL_MS = 70_000;

async function acquireSyncLock(admin: SupabaseClient): Promise<string | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomUUID();
  const lockUntil = new Date(now.getTime() + SYNC_LOCK_TTL_MS).toISOString();
  const { data, error } = await admin
    .from('jma_weather_sync_state')
    .update({
      sync_lock_until: lockUntil,
      sync_lock_token: token,
      last_attempt_at: nowIso,
      last_error: null,
      updated_at: nowIso,
    })
    .eq('id', 1)
    .or('sync_lock_until.is.null,sync_lock_until.lt.' + nowIso)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data ? token : null;
}

async function releaseSyncLock(admin: SupabaseClient, token: string): Promise<void> {
  const { error } = await admin
    .from('jma_weather_sync_state')
    .update({ sync_lock_until: null, sync_lock_token: null, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('sync_lock_token', token);
  if (error) throw error;
}

async function readAlertSnapshot(admin: SupabaseClient) {
  const [alertsResult, stateResult, aggregateResult] = await Promise.all([
    admin.from('jma_weather_alerts').select('area_key,area_name,alert_key,alert_code,alert_name,alert_family,severity,status,details,issued_at,source_product_code,source_url,updated_at').eq('active', true).order('severity', { ascending: false }).order('issued_at', { ascending: false }),
    admin.from('jma_weather_sync_state').select('high_last_success_at,long_last_success_at,last_success_at,last_attempt_at,last_error,sync_lock_until').eq('id', 1).maybeSingle(),
    admin.from('jma_weather_alert_events').select('source_id,issued_at,target_areas').eq('product_code', 'VPWS50').order('issued_at', { ascending: false }).limit(1),
  ]);
  if (alertsResult.error) throw alertsResult.error;
  if (stateResult.error) throw stateResult.error;
  if (aggregateResult.error) throw aggregateResult.error;
  const state = stateResult.data;
  const highLastSuccessAt = state?.high_last_success_at || null;
  const highAge = highLastSuccessAt ? Date.now() - Date.parse(highLastSuccessAt) : Number.POSITIVE_INFINITY;
  const initialized = (aggregateResult.data || []).some((row: { target_areas?: string[] | null }) =>
    (row.target_areas || []).some(area => area === '小平市（多摩北部）' || area === '多摩北部')
  );
  const lockUntil = state?.sync_lock_until ? Date.parse(state.sync_lock_until) : 0;
  return {
    alerts: alertsResult.data || [],
    sync: {
      initialized,
      inProgress: Number.isFinite(lockUntil) && lockUntil > Date.now(),
      highLastSuccessAt,
      longLastSuccessAt: state?.long_last_success_at || null,
      lastSuccessAt: state?.last_success_at || null,
      lastAttemptAt: state?.last_attempt_at || null,
      lastError: state?.last_error || null,
      stale: !initialized || highAge > 3 * 60 * 1000,
    },
  };
}

async function recordFailure(admin: SupabaseClient, error: unknown): Promise<void> {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : '不明な同期エラー';
  await admin.from('jma_weather_sync_state').update({
    last_attempt_at: now,
    last_error: message.slice(0, 1000),
    updated_at: now,
  }).eq('id', 1);
}


export async function GET() {
  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    console.error('JMA weather alert read failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { message: '気象庁の警報・注意報データを読み込めませんでした。', alerts: [], sync: { initialized: false, inProgress: false, stale: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    let snapshot = await readAlertSnapshot(admin);

    // 初回のVPWS50集約電文が未保存なら、サイト表示時に高頻度フィードを即時同期する。
    // 直近1分以内に試行済みならCronの次回実行に任せ、サイト再読み込みによる連続取得を防ぐ。
    // DBの期限付きロックにより、複数ユーザー・画面側の並行GET・Cronとの二重実行も防ぐ。
    const lastAttemptMs = snapshot.sync.lastAttemptAt ? Date.parse(snapshot.sync.lastAttemptAt) : Number.NaN;
    const retryAllowed = !Number.isFinite(lastAttemptMs) || Date.now() - lastAttemptMs >= 60_000;
    if (!snapshot.sync.initialized && !snapshot.sync.inProgress && retryAllowed) {
      let lockToken: string | null = null;
      try {
        lockToken = await acquireSyncLock(admin);
        if (lockToken) {
          try {
            await syncFeed(admin, 'high');
          } catch (error) {
            await recordFailure(admin, error);
            console.error('JMA initial weather alert sync failed:', error instanceof Error ? error.message : 'unknown');
          } finally {
            try {
              await releaseSyncLock(admin, lockToken);
            } catch (releaseError) {
              console.error('JMA initial sync lock release failed:', releaseError instanceof Error ? releaseError.message : 'unknown');
            }
          }
        }
      } catch (error) {
        console.error('JMA initial sync could not start:', error instanceof Error ? error.message : 'unknown');
      }
      snapshot = await readAlertSnapshot(admin);
    }

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('JMA weather alert read failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { message: '気象庁の警報・注意報データを読み込めませんでした。', alerts: [], sync: { initialized: false, inProgress: false, stale: true } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== 'Bearer ' + cronSecret) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }
  let admin: SupabaseClient;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : '設定エラー' }, { status: 500 });
  }

  let mode: 'high' | 'long' = 'high';
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.mode === 'long') mode = 'long';
    const lockToken = await acquireSyncLock(admin);
    if (!lockToken) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode,
        message: '別の気象庁同期が実行中のため、重複同期をスキップしました。',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    try {
      const result = await syncFeed(admin, mode);
      return NextResponse.json({ success: true, ...result, syncedAt: new Date().toISOString() });
    } catch (error) {
      await recordFailure(admin, error);
      console.error('JMA weather alert sync failed:', error instanceof Error ? error.message : 'unknown');
      return NextResponse.json({ success: false, mode, message: error instanceof Error ? error.message : '気象庁XMLの同期に失敗しました。' }, { status: 500 });
    } finally {
      try {
        await releaseSyncLock(admin, lockToken);
      } catch (error) {
        console.error('JMA sync lock release failed:', error instanceof Error ? error.message : 'unknown');
      }
    }
  } catch (error) {
    console.error('JMA weather alert sync lock failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, mode, message: '気象庁同期の開始に失敗しました。' }, { status: 500 });
  }
}
