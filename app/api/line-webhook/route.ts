import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type LineTextMessageEvent = {
  type?: string;
  replyToken?: string;
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

function formatCampusAiReply(payload: CampusAiResponse | null): string {
  const parts: string[] = [];
  const answer = typeof payload?.answer === 'string'
    ? payload.answer.trim()
    : typeof payload?.error === 'string'
      ? payload.error.trim()
      : '';
  if (answer) parts.push(answer);

  const headers = Array.isArray(payload?.table?.headers)
    ? payload.table.headers.filter((value): value is string => typeof value === 'string')
    : [];
  const rows = Array.isArray(payload?.table?.rows)
    ? payload.table.rows.filter((row): row is unknown[] => Array.isArray(row))
    : [];

  if (headers.length && rows.length) {
    const formattedRows = rows.slice(0, 8).map(row =>
      headers.map((header, index) => {
        const rawValue = row[index];
        const value = rawValue === null || rawValue === undefined ? '—' : String(rawValue).trim() || '—';
        return `${header}: ${value}`;
      }).join('｜')
    );
    parts.push(formattedRows.join('\n'));
    if (rows.length > formattedRows.length) {
      parts.push(`ほか${rows.length - formattedRows.length}件あります。詳しい一覧や表表示はCampusSyncサイトのAIで確認してください。`);
    }
  }

  const result = parts.join('\n\n').trim() || '回答を取得できませんでした。少し待ってから、質問をもう一度送ってください。';
  const maxChars = 4500;
  return result.length > maxChars
    ? `${result.slice(0, maxChars - 30)}\n\n（LINEの表示上限に合わせて一部省略しました）`
    : result;
}

async function getCampusAiAnswer(question: string): Promise<string> {
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
      return 'CampusSync AIに接続できませんでした。しばらくしてからもう一度お試しください。';
    }
    return formatCampusAiReply(payload);
  } catch (error) {
    console.error('CampusSync AI request failed:', error instanceof Error ? error.name : 'unknown error');
    return 'CampusSync AIに接続できませんでした。しばらくしてからもう一度お試しください。';
  }
}

async function replyToLine(replyToken: string, text: string, channelAccessToken: string): Promise<void> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.error('LINE reply API returned HTTP', response.status);
    }
  } catch (error) {
    console.error('LINE reply request failed:', error instanceof Error ? error.name : 'unknown error');
  }
}

async function handleLineEvents(events: LineTextMessageEvent[], channelAccessToken: string): Promise<void> {
  await Promise.all(events.map(async event => {
    if (event.type !== 'message' || event.message?.type !== 'text') return;
    if (typeof event.replyToken !== 'string' || !event.replyToken) return;
    const question = typeof event.message.text === 'string' ? event.message.text.trim() : '';
    if (!question) return;

    const answer = await getCampusAiAnswer(question);
    await replyToLine(event.replyToken, answer, channelAccessToken);
  }));
}

export async function GET() {
  return NextResponse.json(
    { ok: true, service: 'CampusSync AI LINE webhook' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!channelSecret || !channelAccessToken) {
    return NextResponse.json(
      { message: 'LINE_CHANNEL_SECRET と LINE_CHANNEL_ACCESS_TOKEN をサーバー環境変数に設定してください。' },
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
  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
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
    await handleLineEvents(events, channelAccessToken);
  });

  return new Response('OK', {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
