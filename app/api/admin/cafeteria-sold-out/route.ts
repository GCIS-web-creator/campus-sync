import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildCafeteriaSoldOutFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MENU_FIELDS = [
  { id: 'soka', name: 'soka_lunch', price: 'soka_lunch_price' },
  { id: 'healthy', name: 'healthy_lunch', price: 'healthy_lunch_price' },
  { id: 'snack', name: 'snack_lunch', price: 'snack_lunch_price' },
  { id: 'curry', name: 'curry', price: 'curry_price' },
  { id: 'noodles', name: 'noodles', price: 'noodles_price' },
] as const;

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected), b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function getTokyoDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) return jsonError('VercelにCAMPUS_SYNC_ADMIN_PASSWORDが設定されていません。', 503);
  if (!isAuthorized(request)) return jsonError('正しいAdminセッションが必要です。', 401);

  const payload = await request.json().catch(() => null) as { menuIds?: unknown } | null;
  const menuIds = Array.isArray(payload?.menuIds)
    ? [...new Set(payload.menuIds.filter((value): value is string => typeof value === 'string'))]
    : [];
  if (!menuIds.length || menuIds.length > 5 || menuIds.some(id => !MENU_FIELDS.some(item => item.id === id))) {
    return jsonError('送信対象の売切メニューを選択してください。', 400);
  }

  const admin = getAdminClient();
  if (!admin) return jsonError('SUPABASE_SERVICE_ROLE_KEYがVercelに設定されていません。', 503);

  const [menuResult, stateResult] = await Promise.all([
    admin.from('cafeteria_daily_menus').select('*').eq('service_date', getTokyoDateKey()).maybeSingle(),
    admin.from('cafeteria_sold_out').select('menu_id,is_sold_out,line_notified_at').in('menu_id', menuIds),
  ]);
  if (menuResult.error || stateResult.error) {
    console.error('学食売切通知の送信対象取得失敗:', menuResult.error?.message, stateResult.error?.message);
    return jsonError('学食メニューまたは通知待ち状態を取得できません。supabase/cafeteria-bulk-line-notifications.sql の実行を確認してください。', 500);
  }
  if (!menuResult.data || menuResult.data.is_closed) return jsonError('本日の学食メニューが登録されていないか、営業していません。', 409);

  const states = new Map((stateResult.data || []).map(row => [String(row.menu_id), row]));
  const pending = MENU_FIELDS.filter(field => menuIds.includes(field.id)).filter(field => {
    const status = states.get(field.id);
    return status?.is_sold_out === true && !status?.line_notified_at && String(menuResult.data[field.name] || '').trim();
  }).map(field => ({
    id: field.id,
    menuName: String(menuResult.data[field.name] || '').trim(),
    price: String(menuResult.data[field.price] || '').trim(),
  }));
  if (!pending.length) return jsonError('送信待ちの売切メニューはありません。Admin画面を再読み込みしてください。', 409);

  const activeBot = await getActiveLineBot();
  if (!activeBot?.accessToken) return jsonError('現在使用中のLINE BOTのアクセストークンがありません。', 503);

  const updatedAt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  const flex = buildCafeteriaSoldOutFlexMessage({ items: pending, updatedAt });
  const retryKey = randomUUID();

  try {
    const broadcast = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + activeBot.accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages: [flex] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!broadcast.ok && broadcast.status !== 409) {
      const details = await broadcast.text().catch(() => '');
      console.error('学食売切の友だち向け配信失敗:', broadcast.status, details.slice(0, 400));
      return jsonError('LINE公式アカウントの友だちへの配信に失敗しました（HTTP ' + broadcast.status + '）。', 502);
    }

    const notifiedAt = new Date().toISOString();
    const update = await admin.from('cafeteria_sold_out')
      .update({ line_notified_at: notifiedAt })
      .in('menu_id', pending.map(item => item.id))
      .eq('is_sold_out', true)
      .is('line_notified_at', null);
    if (update.error) {
      console.error('売切通知済み状態の保存失敗:', update.error.message);
      return NextResponse.json({
        success: true,
        statusSaved: false,
        notifiedIds: pending.map(item => item.id),
        message: 'LINE公式アカウントへの配信は完了しましたが、通知済み状態を保存できませんでした。DBを確認してください。',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // 友だちへの配信に加え、従来どおり「学食売切」を受信する登録グループにも配信します。
    const groupDelivery = await pushLineMessagesToRegisteredChats(activeBot.accessToken, [flex], retryKey, 'cafeteria_sold_out');
    return NextResponse.json({
      success: true,
      statusSaved: true,
      notifiedIds: pending.map(item => item.id),
      groupDelivery,
      message: pending.length + '件の売切情報を1つのFlex Messageで公式アカウントの友だちへ送信しました。' + summarizeLineGroupDelivery(groupDelivery),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学食売切通知の接続エラー:', error instanceof Error ? error.message : 'unknown');
    return jsonError('学食売切通知の送信中に通信エラーが発生しました。', 502);
  }
}
