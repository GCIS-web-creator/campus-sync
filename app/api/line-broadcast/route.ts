import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildNoticeFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BroadcastRequest = {
  password?: unknown;
  title?: unknown;
  message?: unknown;
};

/**
 * Adminから自由入力のお知らせを受け取り、認証コードを検証してLINEへ一斉配信するAPI。
 * LINEトークンはサーバー環境変数のみで管理します。
 */
export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { success: false, message: '不正なリクエスト形式です。ページを再読み込みしてください。' },
      { status: 415, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: BroadcastRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: 'リクエストを読み取れませんでした。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const configuredPassword = process.env.ADMIN_BROADCAST_PASSWORD;
  if (!configuredPassword) {
    return NextResponse.json(
      { success: false, message: 'Vercelに ADMIN_BROADCAST_PASSWORD が設定されていません。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (typeof body.password !== 'string' || !body.password || body.password !== configuredPassword) {
    return NextResponse.json(
      { success: false, message: '配信認証コードが正しくありません。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!title || !message) {
    return NextResponse.json(
      { success: false, message: 'タイトルと本文の両方を入力してください。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (Array.from(title).length > 100 || Array.from(message).length > 1800) {
    return NextResponse.json(
      { success: false, message: 'Flex Messageのタイトルは100文字以内、本文は1,800文字以内にしてください。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const activeLineBot = await getActiveLineBot();
      const accessToken = activeLineBot?.accessToken || null;
  if (!accessToken) {
    return NextResponse.json(
      { success: false, message: '現在使用中のLINE BOTのアクセストークンが設定されていません。' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const messages = [buildNoticeFlexMessage(title, message)];
    const retryKey = randomUUID();
    const lineResponse = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
    });

    if (!lineResponse.ok) {
      console.error('LINE broadcast API error status:', lineResponse.status);
      let errorMessage = `LINE配信に失敗しました（HTTP ${lineResponse.status}）。LINE Developersの設定を確認してください。`;
      if (lineResponse.status === 401 || lineResponse.status === 403) {
        errorMessage = 'LINE配信に失敗しました。現在使用中のLINE BOT設定を確認してください。';
      } else if (lineResponse.status === 429) {
        errorMessage = 'LINEの利用上限または送信制限に達した可能性があります。公式アカウントの利用状況を確認してください。';
      }
      return NextResponse.json(
        { success: false, message: errorMessage },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    // 配信成功をSupabaseへ記録。履歴保存に失敗しても配信成功自体は取り消せません。
    let historySaved = false;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabasePublishableKey) {
      try {
        const supabase = createClient(supabaseUrl, supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: historyError } = await supabase
          .from('line_broadcast_history')
          .insert({ title, message, status: 'sent', sent_at: new Date().toISOString() });
        if (historyError) {
          console.error('LINE配信履歴の保存に失敗しました:', historyError.message);
        } else {
          historySaved = true;
        }
      } catch (historyError) {
        console.error('LINE配信履歴の保存処理に失敗しました:', historyError instanceof Error ? historyError.message : 'unknown error');
      }
    }

    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, messages, retryKey, 'quick_notice');
    const groupSummary = summarizeLineGroupDelivery(groupDelivery);
    const responseMessage = historySaved
      ? '「' + title + '」をLINE公式アカウントの友だちへ配信し、配信履歴にも保存しました。 ' + groupSummary
      : '「' + title + '」をLINE公式アカウントの友だちへ配信しました。ただし、配信履歴の保存には失敗しました。SupabaseのSQL設定を確認してください。 ' + groupSummary;

    return NextResponse.json(
      { success: true, historySaved, message: responseMessage },
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
