import { recordLineDeliveryResponse } from '@/lib/line-delivery-audit';
import { applyCampusSyncFlexFooters } from '@/lib/line-flex-footer';
import { getLineWebhookCredentials } from '@/lib/line-bot-rotation';
import { createHmac, timingSafeEqual } from 'node:crypto';
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

const ASSIGNMENT_SUBJECTS = ['国語演習','古典探求','物理','生物','数３','数C','公共','英コミュ','論表','情報','保健','その他'] as const;
function getLineAssignmentAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}
function parseLineDueDate(value: string): string | null | undefined {
  const normalized = value.trim().normalize('NFKC');
  if (!normalized || /^(なし|未定|期限なし|不要)$/.test(normalized)) return null;
  const match = normalized.match(/^(\d{4})[./年-](\d{1,2})[./月-](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = match[4] === undefined ? 23 : Number(match[4]);
  const minute = match[5] === undefined ? 59 : Number(match[5]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) return undefined;
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString();
}
function parseLineAssignmentContribution(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.normalize('NFKC').match(/^\s*([^:：]+)\s*[:：]\s*(.*?)\s*$/);
    if (match) values[match[1].trim().replace(/\s/g, '')] = match[2].trim();
  }
  const get = (...keys: string[]) => {
    for (const key of keys) if (values[key]) return values[key];
    return '';
  };
  const rawSubject = get('教科','科目').normalize('NFKC').replace(/\s/g, '').replace(/数(?:III|3)/gi, '数３');
  const subject = ASSIGNMENT_SUBJECTS.find(item => item === rawSubject);
  const title = get('課題名','タイトル','課題');
  const details = get('内容','課題内容','詳細','指示事項');
  const targetRaw = get('対象','対象クラス');
  const targetClass = /理系/.test(targetRaw) ? 'science' : 'all';
  const optionRaw = get('選択','選択科目','コース').normalize('NFKC');
  let subjectOption = '';
  if (optionRaw) {
    if (/物理/.test(optionRaw)) subjectOption = '物理選択者';
    else if (/生物/.test(optionRaw)) subjectOption = '生物選択者';
    else if (/アドバン/.test(optionRaw)) subjectOption = 'アドバンスト';
    else if (/スタンダ/.test(optionRaw)) subjectOption = 'スタンダード';
    else if (/intensive/i.test(optionRaw)) subjectOption = 'Intensive';
    else if (/standard/i.test(optionRaw)) subjectOption = 'Standard';
  }
  const dueAt = parseLineDueDate(get('期限','提出期限'));
  const rawType = get('種類','課題の種類');
  const type = /classroom/i.test(rawType) ? 'classroom' : /その他|連絡/.test(rawType) ? 'other' : 'paper';
  const errors: string[] = [];
  if (!subject) errors.push('教科はCampusSyncに登録されている教科名から選んでください。');
  if (!title || title.length > 200) errors.push('課題名を200文字以内で入力してください。');
  if (details.length > 5000) errors.push('内容は5000文字以内にしてください。');
  if (dueAt === undefined) errors.push('期限は YYYY/MM/DD HH:MM または「なし」で入力してください。');
  if (subjectOption && targetClass !== 'science') errors.push('選択科目別の課題は対象を「理系クラス」にしてください。');
  if (targetClass === 'science' && subject === '物理' && !subjectOption) subjectOption = '物理選択者';
  if (targetClass === 'science' && subject === '生物' && !subjectOption) subjectOption = '生物選択者';
  if (targetClass === 'science' && subject === '数３' && !['アドバンスト','スタンダード'].includes(subjectOption)) errors.push('数３は選択欄にアドバンストまたはスタンダードを指定してください。');
  if (targetClass === 'science' && subject === '英コミュ' && !['Intensive','Standard'].includes(subjectOption)) errors.push('英コミュは選択欄にIntensiveまたはStandardを指定してください。');
  return { ok: errors.length === 0, errors, subject, title, details, targetClass, subjectOption, dueAt, type };
}
async function handleLineAssignmentContribution(event: LineTextMessageEvent, replyToken: string, messageText: string, accessToken: string): Promise<boolean> {
  if (event.source?.type !== 'user' || !event.source.userId) return false;
  const normalized = messageText.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const isStartCommand = normalized.startsWith('csai') && /(課題.{0,4}(追加|登録)|(追加|登録).*課題)/.test(normalized);
  const admin = getLineAssignmentAdmin();
  if (!admin) {
    if (isStartCommand) await replyPlain(replyToken, '課題提案を受け付けられません。Supabaseのサーバー設定を確認してください。', accessToken);
    return isStartCommand;
  }
  const lineUserId = event.source.userId;
  const { data: session, error: sessionError } = await admin.from('line_assignment_sessions')
    .select('line_user_id,expires_at').eq('line_user_id', lineUserId).maybeSingle();
  if (sessionError) {
    if (isStartCommand) await replyPlain(replyToken, '課題追加の受付状態を確認できませんでした。もう一度お試しください。', accessToken);
    return isStartCommand;
  }
  if (isStartCommand) {
    const { error } = await admin.from('line_assignment_sessions').upsert({
      line_user_id: lineUserId, step: 'awaiting_assignment_details',
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'line_user_id' });
    if (error) {
      await replyPlain(replyToken, '課題追加フォームを開始できませんでした。しばらくしてから再度お試しください。', accessToken);
      return true;
    }
    await replyPlain(replyToken,
      'CampusSync 課題追加フォーム\n次の項目を入力して、そのまま返信してください。\n\n教科：国語演習\n課題名：\n内容：\n対象：全クラス／理系クラス\n選択：なし／物理選択者／生物選択者／数３アドバンスト／数３スタンダード／英コミュIntensive／英コミュStandard\n期限：YYYY/MM/DD HH:MM／なし\n種類：紙プリント・ノート／Google Classroom／その他\n\n提案はSupabaseに承認待ちで保存され、Admin確認後に正式公開されます。20分以内に返信してください。',
      accessToken);
    return true;
  }
  if (!session) return false;
  if (Date.parse(session.expires_at) <= Date.now()) {
    await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '受付時間が切れました。もう一度「CSAI 課題追加」と送ってください。', accessToken);
    return true;
  }
  if (/^(中止|キャンセル|やめる)$/i.test(normalized)) {
    await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '課題追加を中止しました。', accessToken);
    return true;
  }
  const parsed = parseLineAssignmentContribution(messageText);
  if (!parsed.ok) {
    await replyPlain(replyToken, '入力を確認してください。\n・' + parsed.errors.join('\n・') + '\n\n「項目名：内容」の形式で修正して返信してください。', accessToken);
    return true;
  }
  const { error } = await admin.from('assignment_suggestions').insert({
    line_user_id: lineUserId, title: parsed.title, details: parsed.details,
    subject: parsed.subject, target_class: parsed.targetClass, subject_option: parsed.subjectOption,
    type: parsed.type, due_at: parsed.dueAt, status: 'pending',
  });
  if (error) {
    console.error('LINE assignment suggestion save failed:', error.message);
    await replyPlain(replyToken, 'Supabaseへの保存に失敗しました。提案は保存されていないため、もう一度送信してください。', accessToken);
    return true;
  }
  await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
  await replyPlain(replyToken, '課題提案をSupabaseに保存しました。現在はAdminの承認待ちです。正式公開されるとCampusSyncとLINEへ配信されます。', accessToken);
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
