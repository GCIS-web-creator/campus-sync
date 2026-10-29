import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildCafeteriaSoldOutFlexMessage } from '@/lib/line-flex';

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

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return jsonError('VercelにLINE_CHANNEL_ACCESS_TOKENが設定されていません。', 503);
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
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': randomUUID(),
      },
      body: JSON.stringify({
        messages: [buildCafeteriaSoldOutFlexMessage({ menuName, price, updatedAt })],
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('学食売切LINE通知失敗:', response.status);
      if (response.status === 429) {
        return jsonError('売切状態は保存されましたが、LINEの送信上限に達した可能性があります。公式アカウントの通数を確認してください。', 502);
      }
      if (response.status === 401 || response.status === 403) {
        return jsonError('売切状態は保存されましたが、LINE_CHANNEL_ACCESS_TOKENを確認してください。', 502);
      }
      return jsonError('売切状態は保存されましたが、LINE通知に失敗しました（HTTP ' + response.status + '）。', 502);
    }

    return NextResponse.json({
      success: true,
      message: 'LINE公式アカウントへ売切のお知らせをFlex Messageで送信しました。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('学食売切LINE通知の接続エラー:', error instanceof Error ? error.message : 'unknown error');
    return jsonError('売切状態は保存されましたが、LINE通知の接続に失敗しました。', 502);
  }
}
