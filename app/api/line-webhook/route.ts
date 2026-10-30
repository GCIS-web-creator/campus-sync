import { getLineWebhookCredentials } from '@/lib/line-bot-rotation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { rememberLineChatEvent, type LineChatSource } from '@/lib/line-group-chats';
import { buildCampusAiFlexMessage } from '@/lib/line-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type LineTextMessageEvent = {
  type?: string;
  replyToken?: string;
  source?: LineChatSource;
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookPayload = {
  events?: LineTextMessageEvent[];
};

type AiTable = {
  headers?: unknown;
  rows?: unknown;
};

type CampusAiResponse = {
  answer?: unknown;
  error?: unknown;
  table?: AiTable;
};

function verifyLineSignature(rawBody: string, signature: string, channelSecret: string): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody, 'utf8').digest();
  const received = Buffer.from(signature, 'base64');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function getCampusAiAnswer(question: string): Promise<CampusAiResponse> {
  const baseUrl = (process.env.CAMPUS_SYNC_BASE_URL || 'https://campus-sync-mocha.vercel.app').replace(/\/+$/, '');
  const endpoint = new URL('/api/campus-ai', baseUrl).toString();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.trim().slice(0, 100) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json().catch(() => null) as CampusAiResponse | null;
    if (!response.ok && !payload?.answer && !payload?.error) {
      console.error('CampusSync AI endpoint returned HTTP', response.status);
      return { answer: 'CampusSync AIに接続できませんでした。しばらくしてからもう一度お試しください。' };
    }
    return payload ?? { answer: 'CampusSync AIから回答を取得できませんでした。少し待ってからもう一度質問してください。' };
  } catch (error) {
    console.error('CampusSync AI request failed:', error instanceof Error ? error.name : 'unknown error');
    return { answer: 'CampusSync AIに接続できませんでした。しばらくしてからもう一度お試しください。' };
  }
}

async function replyToLine(
  replyToken: string,
  payload: CampusAiResponse,
  question: string,
  channelAccessToken: string
): Promise<void> {
  const answer = typeof payload.answer === 'string'
    ? payload.answer.trim()
    : typeof payload.error === 'string'
      ? payload.error.trim()
      : '回答を取得できませんでした。少し待ってから、質問をもう一度送ってください。';
  const headers = Array.isArray(payload.table?.headers)
    ? payload.table.headers.filter((value): value is string => typeof value === 'string')
    : [];
  const rows = Array.isArray(payload.table?.rows)
    ? payload.table.rows.filter((row): row is unknown[] => Array.isArray(row))
    : [];
  const message = buildCampusAiFlexMessage({
    question,
    answer,
    headers,
    rows,
  });

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + channelAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken,
        messages: [message],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('LINE Flex reply API returned HTTP', response.status, detail.slice(0, 500));
    }
  } catch (error) {
    console.error('LINE Flex reply request failed:', error instanceof Error ? error.name : 'unknown error');
  }
}

async function handleLineEvents(events: LineTextMessageEvent[], channelAccessToken: string): Promise<void> {
  await Promise.all(events.map(async event => {
    if (event.source?.type === 'group' || event.source?.type === 'room') {
      await rememberLineChatEvent(event.source, event.type || 'unknown');
    }
    if (event.type !== 'message' || event.message?.type !== 'text') return;
    if (typeof event.replyToken !== 'string' || !event.replyToken) return;
    const messageText = typeof event.message.text === 'string' ? event.message.text.trim() : '';

    // 1対1トークは自然文をそのままAIへ送る。グループ・ルームではCSAI接頭辞必須で誤反応を防ぐ。
    const trigger = 'CSAI';
    const hasTrigger = messageText.toUpperCase().startsWith(trigger);
    const isDirectChat = event.source?.type === 'user';
    if (!hasTrigger && !isDirectChat) return;

    const question = hasTrigger
      ? messageText.slice(trigger.length).replace(/^[\sへ:：,、-]+/, '').trim()
      : messageText;
    if (!question) return;

    const answer = await getCampusAiAnswer(question);
    await replyToLine(event.replyToken, answer, question, channelAccessToken);
  }));
}

export async function GET() {
  return NextResponse.json(
    { ok: true, service: 'CampusSync AI LINE webhook' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const channelCredentials = getLineWebhookCredentials();

  if (channelCredentials.length === 0) {
    return NextResponse.json(
      { message: 'LINE BOT 1〜3のWebhook認証情報をサーバー環境変数に設定してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { message: 'Webhook本文を読み取れませんでした。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const signature = request.headers.get('x-line-signature') || '';
  const matchedCredentials = channelCredentials.find(credential =>
    verifyLineSignature(rawBody, signature, credential.channelSecret),
  );
  if (!matchedCredentials) {
    return NextResponse.json(
      { message: 'LINE webhook signature verification failed.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let payload: LineWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LineWebhookPayload;
  } catch {
    return NextResponse.json(
      { message: 'Webhook JSONを読み取れませんでした。' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  after(async () => {
    await handleLineEvents(events, matchedCredentials.accessToken);
  });

  return new Response('OK', {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
