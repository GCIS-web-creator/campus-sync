import { createClient } from '@supabase/supabase-js';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';

type LineDeliveryChannel = 'broadcast' | 'push' | 'reply';
type LineDeliveryDestination = 'official_account' | 'group' | 'room' | 'user' | 'unknown';

export type LineDeliveryAuditOptions = {
  channel: LineDeliveryChannel;
  destinationType?: LineDeliveryDestination;
  destinationId?: string | null;
  kind: string;
  botSlot?: number | null;
  deliveryBatchId?: string | null;
  retryKey?: string | null;
  messages: unknown[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function walkMessage(value: unknown, textParts: string[], bubbleCounter: { value: number }) {
  if (Array.isArray(value)) {
    for (const item of value) walkMessage(item, textParts, bubbleCounter);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const node = value as Record<string, unknown>;
  if (node.type === 'bubble') bubbleCounter.value += 1;
  if (node.type === 'text' && typeof node.text === 'string' && node.text.trim()) {
    textParts.push(node.text.trim());
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'text' && key !== 'altText' && key !== 'url' && key !== 'action') {
      walkMessage(child, textParts, bubbleCounter);
    }
  }
}

function resolveBotSlot(accessToken?: string | null, supplied?: number | null): number | null {
  if (supplied === 0 || supplied === 1 || supplied === 2 || supplied === 3) return supplied;
  if (!accessToken) return null;
  for (const slot of [1, 2, 3] as const) {
    if (process.env[`LINE_CHANNEL_ACCESS_TOKEN_${slot}`] === accessToken) return slot;
  }
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN === accessToken) return 0;
  return null;
}

/**
 * Record an accepted or failed LINE API request without ever storing its
 * Authorization header, reply token, or channel credentials.
 */
export async function recordLineDeliveryResponse(
  response: Response,
  options: LineDeliveryAuditOptions & { accessToken?: string | null },
): Promise<void> {
  try {
    const admin = getAdminClient();
    if (!admin) return;

    const messages = applyCampusSyncFlexFooters(Array.isArray(options.messages) ? options.messages : []);
    const textParts: string[] = [];
    const bubbleCounter = { value: 0 };
    walkMessage(messages, textParts, bubbleCounter);
    const altTexts = messages
      .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === 'object'))
      .map(message => typeof message.altText === 'string' ? message.altText.trim() : '')
      .filter(Boolean);
    const altText = altTexts.join('\n').slice(0, 1600);
    const firstText = textParts.find(Boolean) || '';
    const title = (altTexts[0]?.split(/[｜|]/)[0] || firstText || options.kind).slice(0, 180);
    const body = response.ok || response.status === 409
      ? (response.status === 409 ? '同一Retry Keyのリクエストは受付済みです。' : 'LINE APIがリクエストを受け付けました。')
      : (await response.clone().text().catch(() => '')).slice(0, 800);
    const status = response.ok || response.status === 409 ? 'success' : 'failure';
    const retryKey = options.retryKey && UUID_PATTERN.test(options.retryKey) ? options.retryKey : null;
    const batchId = options.deliveryBatchId && UUID_PATTERN.test(options.deliveryBatchId)
      ? options.deliveryBatchId
      : retryKey;

    const { error } = await admin.from('line_delivery_events').insert({
      delivery_batch_id: batchId,
      channel: options.channel,
      destination_type: options.destinationType || (options.channel === 'broadcast' ? 'official_account' : options.channel === 'reply' ? 'user' : 'unknown'),
      destination_id: options.destinationId || null,
      kind: String(options.kind || 'general').slice(0, 80),
      bot_slot: resolveBotSlot(options.accessToken, options.botSlot),
      status,
      http_status: response.status,
      line_request_id: response.headers.get('x-line-request-id') || response.headers.get('x-line-accepted-request-id') || null,
      retry_key: retryKey,
      title,
      alt_text: altText,
      message_count: messages.length,
      bubble_count: bubbleCounter.value,
      message_text: textParts.join('\n').slice(0, 12000),
      message_payload: messages.slice(0, 5),
      response_summary: body,
      sent_at: new Date().toISOString(),
    });
    if (error) console.error('LINE配信監査ログの保存に失敗:', error.message);
  } catch (error) {
    console.error('LINE配信監査ログの記録に失敗:', error instanceof Error ? error.message : 'unknown');
  }
}
