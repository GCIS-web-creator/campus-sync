"use server";

/**
 * LINE公式アカウントの友だち全員へ、学食混雑のお知らせを配信します。
 * LINEのアクセストークンと配信認証コードはサーバー環境変数だけで管理します。
 */
export async function broadcastCafeteriaCrowdNotice(adminPassword: string) {
  const configuredPassword = process.env.ADMIN_BROADCAST_PASSWORD;
  if (!configuredPassword) {
    return {
      success: false,
      message: 'サーバー側に ADMIN_BROADCAST_PASSWORD が設定されていません。Vercelの環境変数を確認してください。',
    };
  }

  if (!adminPassword || adminPassword !== configuredPassword) {
    return { success: false, message: '配信認証コードが正しくありません。' };
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      success: false,
      message: 'LINE_CHANNEL_ACCESS_TOKEN がサーバー環境変数に設定されていません。',
    };
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            type: 'text',
            text: '【CampusSync お知らせ】学食が混んでいます。時間をずらして利用するなど、混雑緩和にご協力ください。',
          },
        ],
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      // 認証情報などをログに出さず、HTTPステータスだけを記録します。
      console.error('LINE broadcast API error status:', response.status);
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: 'LINE配信に失敗しました。LINE_CHANNEL_ACCESS_TOKEN を再確認してください。',
        };
      }
      if (response.status === 429) {
        return {
          success: false,
          message: 'LINEの配信上限に達した可能性があります。LINE公式アカウントの利用状況を確認してください。',
        };
      }
      return {
        success: false,
        message: `LINE配信に失敗しました（HTTP ${response.status}）。LINE Developersの設定を確認してください。`,
      };
    }

    return {
      success: true,
      message: 'LINE公式アカウントの友だちへ「学食が混んでいます」を配信しました。',
    };
  } catch (error) {
    console.error('LINE broadcast request failed:', error instanceof Error ? error.message : 'unknown error');
    return {
      success: false,
      message: 'LINE APIに接続できませんでした。しばらくしてから再度お試しください。',
    };
  }
}
