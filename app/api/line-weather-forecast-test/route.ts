import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { fetchSchoolWeatherForecast } from '@/lib/weather';
import { buildWeatherForecastBubble } from '@/lib/line-weather-flex';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function tokyoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export async function POST(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD) {
    return jsonError('CAMPUS_SYNC_ADMIN_PASSWORD がサーバーに設定されていません。', 503);
  }
  if (!verifyAdminSessionRequest(request)) {
    return jsonError('Adminログインの有効なセッションが必要です。再ログインしてください。', 401);
  }

  const activeLineBot = await getActiveLineBot();
  const accessToken = activeLineBot?.accessToken || null;
  if (!accessToken) {
    return jsonError('現在使用中のLINE公式アカウントのアクセストークンが設定されていません。', 503);
  }

  let forecast;
  try {
    forecast = await fetchSchoolWeatherForecast(4);
  } catch (error) {
    console.error('LINE天気予報テスト：天気データ取得失敗:', error instanceof Error ? error.message : 'unknown');
    return jsonError('天気予報を取得できませんでした。Open-Meteoの応答を確認してください。', 502);
  }

  const today = tokyoDateKey(new Date());
  const days = forecast.filter(day => day.date > today).slice(0, 3);
  if (days.length === 0) {
    return jsonError('明日から3日間の天気予報データがありません。', 502);
  }

  const message = {
    type: 'flex' as const,
    altText: ('【CampusSync 天気予報テスト】明日から' + days.length + '日間の天気予報をお送りします。').slice(0, 400),
    contents: buildWeatherForecastBubble(days),
  };
  const retryKey = randomUUID();

  try {
    // Official-account broadcast only. Deliberately do not call any registered-group delivery helper.
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages: [message] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      console.error('天気予報の公式アカウント限定配信に失敗:', response.status, detail);
      return jsonError(
        response.status === 429
          ? 'LINEの送信上限またはレート制限に達した可能性があります。'
          : '天気予報をLINE公式アカウントへ送信できませんでした（HTTP ' + response.status + '）。',
        502,
      );
    }

    return NextResponse.json({
      success: true,
      sent: true,
      recipientScope: 'official_account_friends_only',
      groupDelivery: false,
      forecastDates: days.map(day => day.date),
      message: '天気予報をLINE公式アカウントの友だちだけにテスト配信しました。登録済みグループには送信していません。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('天気予報のLINE公式アカウント限定配信に失敗:', error instanceof Error ? error.message : 'unknown');
    return jsonError('LINE APIへの接続に失敗しました。アクセストークンと通信状況を確認してください。', 502);
  }
}
