import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { getLineWebhookCredentials } from '@/lib/line-bot-rotation';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { after, NextResponse } from 'next/server';
import { rememberLineChatEvent, type LineChatSource } from '@/lib/line-group-chats';
import { buildCampusAiFlexMessage } from '@/lib/line-flex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type LineTextMessageEvent = {
  type?: string;
  replyToken?: string;
  source?: LineChatSource & { userId?: string };
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
        messages: applyCampusSyncFlexFooters([message]),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    await recordLineDeliveryResponse(response, { channel: 'reply', destinationType: 'user', kind: 'campus_ai', accessToken: channelAccessToken, messages: [message] });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('LINE Flex reply API returned HTTP', response.status, detail.slice(0, 500));
    }
  } catch (error) {
    console.error('LINE Flex reply request failed:', error instanceof Error ? error.name : 'unknown error');
  }
}


async function replyPlain(replyToken: string, text: string, accessToken: string): Promise<void> {
  try {
    const content = text.slice(0, 4500);
    const messages = [{ type: 'text', text: content }];
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    await recordLineDeliveryResponse(response, { channel: 'reply', destinationType: 'user', kind: 'assignment_contribution', accessToken, messages });
    if (!response.ok) console.error('LINE assignment reply failed:', response.status);
  } catch (error) {
    console.error('LINE assignment reply request failed:', error instanceof Error ? error.name : 'unknown');
  }
}

function getLineAssignmentAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

async function replyFlex(
  replyToken: string,
  message: Record<string, unknown>,
  accessToken: string,
): Promise<void> {
  try {
    const messages = applyCampusSyncFlexFooters([message]);
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken, messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    await recordLineDeliveryResponse(response, {
      channel: 'reply',
      destinationType: 'user',
      kind: 'assignment_contribution',
      accessToken,
      messages,
    });
    if (!response.ok) {
      console.error('LINE assignment Flex reply failed:', response.status);
    }
  } catch (error) {
    console.error('LINE assignment Flex reply request failed:', error instanceof Error ? error.name : 'unknown');
  }
}

function buildLineAssignmentFormFlexMessage(formUrl: string): Record<string, unknown> {
  return {
    type: 'flex',
    altText: 'CampusSync｜課題追加フォームを開く',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#123B43',
        paddingAll: '18px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC  /  ASSIGNMENT FORM', size: 'xxs', color: '#A7D3CD', weight: 'bold', wrap: true },
          { type: 'text', text: '課題を追加する', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
          { type: 'text', text: '入力・選択は専用フォームで行えます', size: 'xs', color: '#D5E6E3', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F0FDFA',
            cornerRadius: '12px',
            paddingAll: '13px',
            spacing: 'sm',
            contents: [
              { type: 'text', text: 'フォームでできること', size: 'sm', color: '#115E59', weight: 'bold' },
              { type: 'text', text: '・教科、対象クラス、課題の種類を選択', size: 'xs', color: '#334155', wrap: true },
              { type: 'text', text: '・課題名と詳しい内容を入力', size: 'xs', color: '#334155', wrap: true },
              { type: 'text', text: '・提出期限をカレンダーと時刻から指定', size: 'xs', color: '#334155', wrap: true },
            ],
          },
          { type: 'text', text: '送信した課題は承認待ちとして保存され、管理者の確認後に正式公開されます。', size: 'xs', color: '#64748B', wrap: true },
          {
            type: 'button',
            style: 'primary',
            color: '#0F766E',
            height: 'md',
            action: { type: 'uri', label: '課題登録フォームを開く', uri: formUrl },
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        backgroundColor: '#F8FAFC',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC・SOKA HIGH SCHOOL', size: 'xs', color: '#64748B', align: 'center', wrap: true },
          { type: 'text', text: '@ created by Fuku', size: 'xs', color: '#64748B', align: 'center', wrap: true },
        ],
      },
    },
  };
}

async function handleLineAssignmentContribution(
  event: LineTextMessageEvent,
  replyToken: string,
  messageText: string,
  accessToken: string,
): Promise<boolean> {
  if (event.source?.type !== 'user' || !event.source.userId) return false;

  const normalized = messageText.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const isStartCommand = normalized.startsWith('csai')
    && /(課題.{0,4}(追加|登録)|(追加|登録).*課題)/.test(normalized);
  const isCancelCommand = /^(中止|キャンセル|やめる)$/.test(normalized);
  const admin = getLineAssignmentAdmin();

  if (!admin) {
    if (isStartCommand) {
      await replyPlain(replyToken, '課題フォームを開始できません。Supabaseのサーバー設定を確認してください。', accessToken);
    }
    return isStartCommand;
  }

  const lineUserId = event.source.userId;
  const { data: session, error: sessionError } = await admin.from('line_assignment_sessions')
    .select('line_user_id,expires_at,form_token_hash')
    .eq('line_user_id', lineUserId)
    .maybeSingle();

  if (sessionError) {
    if (isStartCommand) {
      await replyPlain(replyToken, '課題追加の受付状態を確認できませんでした。もう一度お試しください。', accessToken);
    }
    return isStartCommand;
  }

  if (isCancelCommand && session) {
    await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '課題追加を中止しました。', accessToken);
    return true;
  }

  if (!isStartCommand && !session) return false;

  if (session && Date.parse(session.expires_at) <= Date.now()) {
    await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    if (!isStartCommand) {
      await replyPlain(replyToken, '課題フォームの有効期限が切れました。もう一度「CSAI 課題追加」と送ってください。', accessToken);
      return true;
    }
  }

  // Each form URL is a random, single-use capability. Only its SHA-256 hash is stored.
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { error: upsertError } = await admin.from('line_assignment_sessions').upsert({
    line_user_id: lineUserId,
    step: 'awaiting_assignment_details',
    form_token_hash: tokenHash,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'line_user_id' });

  if (upsertError) {
    console.error('LINE assignment form session could not be created:', upsertError.message);
    await replyPlain(replyToken, '課題フォームを準備できませんでした。管理者によるデータベース更新が必要な場合があります。', accessToken);
    return true;
  }

  const baseUrl = (process.env.CAMPUS_SYNC_BASE_URL || 'https://campus-sync-mocha.vercel.app').replace(/\/+$/, '');
  const formUrl = new URL('/line/assignments', baseUrl);
  formUrl.searchParams.set('token', token);
  await replyFlex(replyToken, buildLineAssignmentFormFlexMessage(formUrl.toString()), accessToken);
  return true;
}

async function handleLineEvents(
  events: LineTextMessageEvent[],
  channelAccessToken: string,
  botSlot: 0 | 1 | 2 | 3 | 4 | 5,
): Promise<void> {
  await Promise.all(events.map(async event => {
    if (event.source?.type === 'group' || event.source?.type === 'room') {
      await rememberLineChatEvent(event.source, event.type || 'unknown', botSlot);
    }
    if (event.type !== 'message' || event.message?.type !== 'text') return;
    if (typeof event.replyToken !== 'string' || !event.replyToken) return;
    const messageText = typeof event.message.text === 'string' ? event.message.text.trim() : '';
    const assignmentHandled = await handleLineAssignmentContribution(event, event.replyToken, messageText, channelAccessToken);
    if (assignmentHandled) return;

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
      { message: 'LINE BOT 1〜5のWebhook認証情報をサーバー環境変数に設定してください。' },
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
    await handleLineEvents(events, matchedCredentials.accessToken, matchedCredentials.slot);
  });

  return new Response('OK', {
    status: 200,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
