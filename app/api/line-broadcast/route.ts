import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin のクイックお知らせから、LINE公式アカウントの友だちへ一斉配信するAPI。
 * 認証情報はサーバー環境変数のみで管理します。
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { success: false, message: '不正なリクエスト形式です。ページを再読み込みしてから試してください。' },
      { status: 415, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'リクエストを読み取れませんでした。ページを再読み込みしてください。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const configuredPassword = process.env.ADMIN_BROADCAST_PASSWORD;
  if (!configuredPassword) {
    return NextResponse.json(
      { success: false, message: 'サーバー側に ADMIN_BROADCAST_PASSWORD が設定されていません。Vercelの環境変数を確認してください。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (typeof body.password !== 'string' || body.password.length === 0 || body.password !== configuredPassword) {
    return NextResponse.json(
      { success: false, message: '配信認証コードが正しくありません。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { success: false, message: 'LINE_CHANNEL_ACCESS_TOKEN がサーバー環境変数に設定されていません。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          type: 'text',
          text: '【CampusSync お知らせ】学食が混んでいます。時間をずらして利用するなど、混雑緩和にご協力ください。',
        }],
      }),
      cache: 'no-store',
    });

    if (!lineResponse.ok) {
      // トークンなどの秘密情報はログに出さない。
      console.error('LINE broadcast API error status:', lineResponse.status);
      let message = `LINE配信に失敗しました（HTTP ${lineResponse.status}）。LINE Developersの設定を確認してください。`;
      if (lineResponse.status === 401 || lineResponse.status === 403) {
        message = 'LINE配信に失敗しました。LINE_CHANNEL_ACCESS_TOKEN を確認してください。';
      } else if (lineResponse.status === 429) {
        message = 'LINEの配信上限に達した可能性があります。LINE公式アカウントの利用状況を確認してください。';
      }
      return NextResponse.json(
        { success: false, message },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { success: true, message: 'LINE公式アカウントの友だちへ「学食が混んでいます」を配信しました。' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('LINE broadcast request failed:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { success: false, message: 'LINE APIに接続できませんでした。しばらくしてから再度お試しください。' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
