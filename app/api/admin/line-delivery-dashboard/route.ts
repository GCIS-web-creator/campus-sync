import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getLineBotEnvironmentStatus } from '@/lib/line-bot-rotation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) {
    return NextResponse.json({ success: false, message: 'Adminセッションの有効期限が切れています。再ログインしてください。' }, { status: 401 });
  }
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  const requestedDays = Number(new URL(request.url).searchParams.get('days') || 14);
  const days = [1, 7, 14].includes(requestedDays) ? requestedDays : 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [auditResult, historyResult, groupResult, rotationResult, chatsResult] = await Promise.all([
    admin.from('line_delivery_events')
      .select('id,delivery_batch_id,channel,destination_type,destination_id,kind,bot_slot,status,http_status,line_request_id,retry_key,title,alt_text,message_count,bubble_count,message_text,response_summary,sent_at')
      .gte('sent_at', since).order('sent_at', { ascending: false }).limit(1500),
    admin.from('line_broadcast_history')
      .select('id,title,message,status,sent_at,delivery_batch_id,bot_slot')
      .gte('sent_at', since).order('sent_at', { ascending: false }).limit(500),
    admin.from('line_group_delivery_logs')
      .select('id,delivery_batch_id,kind,chat_id,chat_type,bot_slot,status,http_status,error_message,sent_at')
      .gte('sent_at', since).order('sent_at', { ascending: false }).limit(1000),
    admin.from('line_bot_rotation')
      .select('active_bot_slot,next_switch_at,last_switched_at,rotation_hold_until,updated_at').eq('id', 1).maybeSingle(),
    admin.from('line_group_chats')
      .select('chat_id,chat_type,active,bot_slot,last_seen_at').order('last_seen_at', { ascending: false }).limit(100),
  ]);

  if (auditResult.error) {
    console.error('LINE詳細配信ログを取得できません:', auditResult.error.message);
    return NextResponse.json({ success: false, message: '詳細配信ログを読み込めません。line-delivery-dashboard.sql がSupabaseに反映されているか確認してください。' }, { status: 500 });
  }
  if (historyResult.error) {
    console.error('LINE配信履歴を取得できません:', historyResult.error.message);
    return NextResponse.json({ success: false, message: '公式アカウント配信履歴を取得できません。' }, { status: 500 });
  }

  const auditEvents = (auditResult.data || []) as Array<Record<string, any>>;
  const auditedBroadcastBatches = new Set(auditEvents
    .filter(event => event.channel === 'broadcast' && event.delivery_batch_id)
    .map(event => String(event.delivery_batch_id)));
  const auditedGroupTargets = new Set(auditEvents
    .filter(event => event.channel === 'push' && event.delivery_batch_id && event.destination_id)
    .map(event => String(event.delivery_batch_id) + ':' + String(event.destination_id)));

  const legacyBroadcasts = (historyResult.data || [])
    .filter(row => !row.delivery_batch_id || !auditedBroadcastBatches.has(String(row.delivery_batch_id)))
    .map(row => ({
      id: 'history:' + row.id, source: 'legacy_history', delivery_batch_id: row.delivery_batch_id || null,
      channel: 'broadcast', destination_type: 'official_account', destination_id: null, kind: 'legacy',
      bot_slot: row.bot_slot ?? null, status: row.status === 'failed' || row.status === 'failure' ? 'failure' : 'success',
      http_status: null, line_request_id: null, retry_key: null, title: row.title || 'LINE配信',
      alt_text: row.message || '', message_count: 1, bubble_count: null, message_text: row.message || '',
      response_summary: '従来の配信履歴。HTTP応答・LINEリクエストIDは未記録です。',
      sent_at: row.sent_at,
    }));

  const legacyGroups = (groupResult.data || [])
    .filter(row => !auditedGroupTargets.has(String(row.delivery_batch_id) + ':' + String(row.chat_id)))
    .map(row => ({
      id: 'group-log:' + row.id, source: 'legacy_group_log', delivery_batch_id: row.delivery_batch_id,
      channel: 'push', destination_type: row.chat_type, destination_id: row.chat_id, kind: row.kind,
      bot_slot: row.bot_slot ?? null, status: row.status, http_status: row.http_status, line_request_id: null,
      retry_key: null, title: 'グループ配信記録', alt_text: '', message_count: null, bubble_count: null,
      message_text: '', response_summary: row.error_message || (row.status === 'success' ? 'LINE API受付成功（旧ログ）' : '送信失敗（旧ログ）'),
      sent_at: row.sent_at,
    }));

  const events = [...auditEvents.map(event => ({ ...event, source: 'detailed' })), ...legacyBroadcasts, ...legacyGroups]
    .sort((a, b) => new Date(String(b.sent_at || 0)).getTime() - new Date(String(a.sent_at || 0)).getTime())
    .slice(0, 1500);

  return NextResponse.json({
    success: true, days, since, events, rotation: rotationResult.data || null,
    botEnvironment: getLineBotEnvironmentStatus(), groups: chatsResult.data || [],
    dataWarnings: [
      ...(groupResult.error ? ['グループ別の旧配信ログを読み込めませんでした。'] : []),
      ...(rotationResult.error ? ['BOTローテーション情報を読み込めませんでした。'] : []),
      ...(chatsResult.error ? ['登録グループ一覧を読み込めませんでした。'] : []),
    ],
    note: '公式アカウントへのbroadcastはLINE API受付結果を記録しています。実際に友だちの端末へ届いた人数・開封数を示すものではありません。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
