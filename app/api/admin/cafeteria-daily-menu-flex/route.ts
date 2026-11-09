import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { buildCafeteriaDailyMenuFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MENU_FIELDS = [
  { id: 'soka', category: '創価ランチ', name: 'soka_lunch', price: 'soka_lunch_price', calorie: 'soka_lunch_calorie', allergy: 'soka_lunch_allergy' },
  { id: 'healthy', category: 'ヘルシーランチ', name: 'healthy_lunch', price: 'healthy_lunch_price', calorie: 'healthy_lunch_calorie', allergy: 'healthy_lunch_allergy' },
  { id: 'snack', category: 'スナックランチ', name: 'snack_lunch', price: 'snack_lunch_price', calorie: 'snack_lunch_calorie', allergy: 'snack_lunch_allergy' },
  { id: 'curry', category: 'カレー', name: 'curry', price: 'curry_price', calorie: 'curry_calorie', allergy: 'curry_allergy' },
  { id: 'noodles', category: '麺類', name: 'noodles', price: 'noodles_price', calorie: 'noodles_calorie', allergy: 'noodles_allergy' },
] as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin); }
  catch { return false; }
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
  if (!sameOrigin(request)) return jsonError('不正な管理操作です。', 403);
  if (!verifyAdminSessionRequest(request)) return jsonError('Adminログインが必要です。', 401);
  const admin = getAdminClient();
  if (!admin) return jsonError('Supabaseサーバー設定が不足しています。', 503);

  const serviceDate = getTokyoDateKey();
  const [menuResult, soldOutResult] = await Promise.all([
    admin.from('cafeteria_daily_menus').select('*').eq('service_date', serviceDate).maybeSingle(),
    admin.from('cafeteria_sold_out').select('menu_id,is_sold_out'),
  ]);
  if (menuResult.error || soldOutResult.error) {
    console.error('今日の学食メニューFlex取得失敗:', menuResult.error?.message, soldOutResult.error?.message);
    return jsonError('今日の献立・売切状態を取得できませんでした。', 500);
  }
  const menu = menuResult.data;
  if (!menu) return jsonError('今日の学食メニューが登録されていません。先に月間献立表を保存してください。', 409);
  if (menu.is_closed === true) return jsonError('今日は学食の営業がありません。配信は行いません。', 409);

  const soldOutById = new Map((soldOutResult.data || []).map(row => [String(row.menu_id), row.is_sold_out === true]));
  const items = MENU_FIELDS.flatMap(field => {
    const name = String(menu[field.name] || '').trim();
    if (!name) return [];
    return [{
      category: field.category,
      name,
      price: String(menu[field.price] || '').trim(),
      calorie: String(menu[field.calorie] || '').trim(),
      allergy: String(menu[field.allergy] || '').trim(),
      isSoldOut: soldOutById.get(field.id) === true,
    }];
  });
  if (!items.length) return jsonError('今日の献立に配信できるメニューがありません。', 409);

  const activeBot = await getActiveLineBot();
  if (!activeBot?.accessToken) return jsonError('現在使用中のLINE BOTのアクセストークンがありません。', 503);
  const dateLabel = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short',
  }).format(new Date(serviceDate + 'T00:00:00+09:00'));
  const flex = buildCafeteriaDailyMenuFlexMessage({ dateLabel, items, note: String(menu.note || '') });
  const messages = applyCampusSyncFlexFooters([flex]);
  const retryKey = randomUUID();

  try {
    const broadcast = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + activeBot.accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    await recordLineDeliveryResponse(broadcast, {
      channel: 'broadcast', kind: 'cafeteria_menu', accessToken: activeBot.accessToken,
      retryKey, deliveryBatchId: retryKey, messages,
    });
    if (!broadcast.ok && broadcast.status !== 409) {
      const details = await broadcast.text().catch(() => '');
      console.error('今日の学食メニューFlex送信失敗:', broadcast.status, details.slice(0, 500));
      return jsonError(
        broadcast.status === 429
          ? 'LINEの送信上限またはレート制限に達しました。時間をおいて配信状況を確認してください。'
          : 'LINE公式アカウントの友だちへの配信に失敗しました（HTTP ' + broadcast.status + '）。',
        502,
      );
    }
    const groupDelivery = await pushLineMessagesToRegisteredChats(activeBot.accessToken, [flex], retryKey, 'cafeteria_menu', retryKey);
    return NextResponse.json({
      success: true, serviceDate, menuCount: items.length, botSlot: activeBot.slot, groupDelivery,
      message: '今日の学食メニューをFlex Messageで公式アカウントの友だちへ配信しました。' + summarizeLineGroupDelivery(groupDelivery),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('今日の学食メニューFlex配信通信エラー:', error instanceof Error ? error.message : 'unknown');
    return jsonError('今日の学食メニューをLINEへ送信中に通信エラーが発生しました。配信履歴を確認してください。', 502);
  }
}
