import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildCafeteriaSoldOutFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) {
    return jsonError('VercelにCAMPUS_SYNC_ADMIN_PASSWORDが設定されていません。', 503);
  }
  if (!isAuthorized(request)) {
    return jsonError('LINEの売切通知には正しいAdmin用パスワードが必要です。', 401);
  }

  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!accessToken) {
    return jsonError('Vercelに現在使用中のLINE BOTのアクセストークンが設定されていません。', 503);
  }

  const body = await request.json().catch(() => null) as { menuName?: unknown; price?: unknown } | null;
  const menuName = typeof body?.menuName === 'string' ? body.menuName.trim() : '';
  const price = typeof body?.price === 'string' ? body.price.trim() : '';
  if (!menuName || menuName.length > 100 || price.length > 40) {
    return jsonError('メニュー名が未入力、または文字数の上限を超えています。', 400);
  }

  const updatedAt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date());

  try {
    const messages = [buildCafeteriaSoldOutFlexMessage({ menuName, price, updatedAt })];
    const retryKey = randomUUID();
    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, messages, retryKey, 'cafeteria_sold_out');
    const groupSummary = summarizeLineGroupDelivery(groupDelivery);
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('学食売切LINE通知失敗:', response.status);
      if (response.status === 429) {
        return jsonError('LINEの送信上限に達した可能性があります。グループ配信結果：' + groupSummary, 502);
      }
      if (response.status === 401 || response.status === 403) {
        return jsonError('現在使用中のLINE BOT設定を確認してください。グループ配信結果：' + groupSummary, 502);
      }
      return jsonError('LINE友だち向け通知に失敗しました（HTTP ' + response.status + '）。グループ配信結果：' + groupSummary, 502);
    }

    return NextResponse.json({
      success: true,
      message: 'LINE公式アカウントへ売切のお知らせをFlex Messageで送信しました。 ' + groupSummary,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学食売切LINE通知の接続エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('売切状態は保存されましたが、LINE通知の接続に失敗しました。', 502);
  }
}
