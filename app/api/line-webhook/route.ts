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


type AssignmentQuickReplyOption = { label: string; text: string };
type LineAssignmentDraft = {
  subject?: string;
  targetClass?: 'all' | 'science';
  subjectOption?: string;
  title?: string;
  details?: string;
  assignmentType?: 'paper' | 'classroom' | 'other';
  dueAt?: string | null;
};
const LINE_ASSIGNMENT_SUBJECTS = [
  '国語演習', '古典探求', '物理', '生物', '数３', '数C',
  '公共', '英コミュ', '論表', '情報', '保健', 'その他',
] as const;

function getLineAssignmentAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

async function replyPlain(
  replyToken: string,
  text: string,
  accessToken: string,
  quickReplies: AssignmentQuickReplyOption[] = [],
): Promise<void> {
  try {
    const message: Record<string, unknown> = { type: 'text', text: text.slice(0, 4500) };
    if (quickReplies.length) {
      message.quickReply = {
        items: quickReplies.slice(0, 13).map(option => ({
          type: 'action',
          action: {
            type: 'message',
            label: Array.from(option.label).slice(0, 20).join(''),
            text: option.text.slice(0, 300),
          },
        })),
      };
    }
    const messages = [message];
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    await recordLineDeliveryResponse(response, { channel: 'reply', destinationType: 'user', kind: 'assignment_contribution', accessToken, messages });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('LINE assignment reply failed:', response.status, detail.slice(0, 300));
    }
  } catch (error) {
    console.error('LINE assignment reply request failed:', error instanceof Error ? error.name : 'unknown');
  }
}

function getLineAssignmentOptionChoices(draft: LineAssignmentDraft): string[] {
  if (draft.targetClass !== 'science') return [];
  if (draft.subject === '数３') return ['アドバンスト', 'スタンダード'];
  if (draft.subject === '英コミュ') return ['Intensive', 'Standard'];
  if (draft.subject === '物理') return ['物理選択者'];
  if (draft.subject === '生物') return ['生物選択者'];
  return [];
}
function needsLineAssignmentOption(draft: LineAssignmentDraft): boolean {
  return draft.targetClass === 'science' && ['数３', '英コミュ'].includes(draft.subject || '');
}
function parseLineAssignmentDueAt(value: string): string | null {
  const normalized = value.normalize('NFKC').trim();
  let year = 0, month = 0, day = 0, hour = 0, minute = 0;
  const full = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  const short = normalized.match(/^(\d{1,2})[/-](\d{1,2})[ ]+(\d{1,2}):(\d{2})$/)
    || normalized.match(/^(\d{1,2})月(\d{1,2})日[ ]+(\d{1,2}):(\d{2})$/);
  if (full) {
    year = Number(full[1]); month = Number(full[2]); day = Number(full[3]);
    hour = Number(full[4]); minute = Number(full[5]);
  } else if (short) {
    year = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(new Date()));
    month = Number(short[1]); day = Number(short[2]); hour = Number(short[3]); minute = Number(short[4]);
  } else return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString();
}
function formatLineAssignmentDueAt(value: string | null | undefined): string {
  if (!value) return '期限なし';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
function buildLineAssignmentPrompt(step: string, draft: LineAssignmentDraft): { text: string; quickReplies: AssignmentQuickReplyOption[] } {
  const options = (values: string[]): AssignmentQuickReplyOption[] => values.map(value => ({ label: value, text: value }));
  switch (step) {
    case 'awaiting_subject':
      return { text: '📝 課題登録を始めます。\nまず教科を選択してください。下のボタンを押すか、教科名をそのまま送信してください。', quickReplies: options([...LINE_ASSIGNMENT_SUBJECTS]) };
    case 'awaiting_target_class':
      return { text: '対象を選択してください。', quickReplies: options(['全クラス', '理系クラス']) };
    case 'awaiting_subject_option':
      return { text: '選択区分を選んでください。', quickReplies: options(getLineAssignmentOptionChoices(draft)) };
    case 'awaiting_type':
      return { text: '課題の種類を選択してください。', quickReplies: [
        { label: '紙プリント・ノート', text: '紙プリント・ノート' },
        { label: 'Google Classroom', text: 'Google Classroom' },
        { label: 'その他・連絡', text: 'その他・連絡' },
      ] };
    case 'awaiting_title':
      return { text: '課題名を送信してください。\n例：数学演習プリント P20〜21（200文字以内）', quickReplies: [] };
    case 'awaiting_details':
      return { text: '課題の内容・指示事項を送信してください。\n提出範囲、方法、注意事項などを書けます。説明が不要なら「省略する」を押してください。', quickReplies: [{ label: '省略する', text: '省略する' }] };
    case 'awaiting_deadline':
      return { text: '提出期限を入力してください。\n例：YYYY/MM/DD HH:mm または M/D HH:mm\n期限を設定しない場合は下の「期限なし」を押してください。', quickReplies: [{ label: '期限なし', text: '期限なし' }] };
    case 'awaiting_confirmation': {
      const target = draft.targetClass === 'science' ? '理系クラス' + (draft.subjectOption ? '（' + draft.subjectOption + '）' : '') : '全クラス';
      const typeLabel = draft.assignmentType === 'classroom' ? 'Google Classroom' : draft.assignmentType === 'other' ? 'その他・連絡' : '紙プリント・ノート';
      const details = draft.details?.trim() || '（記載なし）';
      const detailPreview = details.length > 700 ? details.slice(0, 700) + '…（続きは登録内容に保存されます）' : details;
      const optionEdit = needsLineAssignmentOption(draft) ? [{ label: '選択区分を修正', text: '選択区分を修正' }] : [];
      return {
        text: [
          '📋 課題登録内容の確認', '',
          '教科：' + (draft.subject || '未設定'),
          '対象：' + target,
          '課題名：' + (draft.title || '未設定'),
          '種類：' + typeLabel,
          '提出期限：' + formatLineAssignmentDueAt(draft.dueAt), '',
          '課題の内容：', detailPreview, '',
          'この内容で管理者に提出します。よければ「送信する」を押してください。',
        ].join('\n'),
        quickReplies: [
          { label: '送信する', text: '送信する' },
          { label: '教科を修正', text: '教科を修正' },
          { label: '対象を修正', text: '対象を修正' },
          ...optionEdit,
          { label: '種類を修正', text: '種類を修正' },
          { label: '課題名を修正', text: '課題名を修正' },
          { label: '内容を修正', text: '内容を修正' },
          { label: '期限を修正', text: '期限を修正' },
          { label: '最初からやり直す', text: '最初からやり直す' },
        ],
      };
    }
    default:
      return { text: '課題登録の入力状態を確認できませんでした。「CSAI 課題追加」と送信して最初からやり直してください。', quickReplies: [] };
  }
}
async function saveLineAssignmentSession(
  admin: ReturnType<typeof getLineAssignmentAdmin> & {},
  lineUserId: string,
  step: string,
  draft: LineAssignmentDraft,
): Promise<boolean> {
  const now = new Date();
  const { error } = await admin.from('line_assignment_sessions').upsert({
    line_user_id: lineUserId, step, draft_data: draft, form_token_hash: null,
    expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    updated_at: now.toISOString(),
  }, { onConflict: 'line_user_id' });
  if (error) console.error('LINE assignment chat session save failed:', error.message);
  return !error;
}
async function replyLineAssignmentStep(replyToken: string, accessToken: string, step: string, draft: LineAssignmentDraft, prefix = ''): Promise<void> {
  const prompt = buildLineAssignmentPrompt(step, draft);
  await replyPlain(replyToken, (prefix ? prefix + '\n\n' : '') + prompt.text, accessToken, prompt.quickReplies);
}

async function handleLineAssignmentContribution(
  event: LineTextMessageEvent,
  replyToken: string,
  messageText: string,
  accessToken: string,
): Promise<boolean> {
  if (event.source?.type !== 'user' || !event.source.userId) return false;
  const normalized = messageText.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const isStartCommand = normalized.startsWith('csai') && /(課題.{0,4}(追加|登録)|(追加|登録).*課題)/.test(normalized);
  const isCancelCommand = /^(中止|キャンセル|やめる)$/.test(normalized);
  const admin = getLineAssignmentAdmin();
  if (!admin) {
    if (isStartCommand) await replyPlain(replyToken, '課題登録サービスの設定を確認できません。しばらくしてからもう一度お試しください。', accessToken);
    return isStartCommand;
  }

  const lineUserId = event.source.userId;
  if (isStartCommand) {
    const started = await saveLineAssignmentSession(admin, lineUserId, 'awaiting_subject', {});
    if (!started) {
      await replyPlain(replyToken, '課題登録を開始できませんでした。もう一度お試しください。', accessToken);
      return true;
    }
    await replyLineAssignmentStep(replyToken, accessToken, 'awaiting_subject', {});
    return true;
  }

  const { data: session, error: sessionError } = await admin.from('line_assignment_sessions')
    .select('line_user_id,step,expires_at,draft_data')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  if (sessionError) {
    console.error('LINE assignment chat session lookup failed:', sessionError.message);
    return false;
  }
  if (!session) return false;

  if (isCancelCommand) {
    const { error } = await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    if (error) console.error('LINE assignment chat cancel failed:', error.message);
    await replyPlain(replyToken, error ? '中止処理を完了できませんでした。もう一度「中止」と送ってください。' : '課題登録を中止しました。入力内容は登録されていません。', accessToken);
    return true;
  }
  if (Date.parse(String(session.expires_at)) <= Date.now()) {
    await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '課題登録の入力期限（60分）が切れました。もう一度「CSAI 課題追加」と送信してください。', accessToken);
    return true;
  }
  if (session.step === 'submitting') {
    await replyPlain(replyToken, '課題を保存しています。完了メッセージが届くまで少しお待ちください。', accessToken);
    return true;
  }

  let step = String(session.step || '');
  let draft: LineAssignmentDraft = session.draft_data && typeof session.draft_data === 'object' && !Array.isArray(session.draft_data)
    ? { ...(session.draft_data as LineAssignmentDraft) } : {};
  const validSteps = new Set([
    'awaiting_subject', 'awaiting_target_class', 'awaiting_subject_option',
    'awaiting_type', 'awaiting_title', 'awaiting_details', 'awaiting_deadline', 'awaiting_confirmation',
  ]);
  if (!validSteps.has(step)) {
    step = 'awaiting_subject';
    draft = {};
    const saved = await saveLineAssignmentSession(admin, lineUserId, step, draft);
    await replyLineAssignmentStep(replyToken, accessToken, step, draft, saved ? '以前の入力形式のセッションが残っていたため、新しいLINE内フォームに切り替えました。' : '入力状態を更新できませんでした。');
    return true;
  }

  const input = messageText.trim();
  let nextStep = step;
  let validationError = '';

  if (step === 'awaiting_subject') {
    if (!LINE_ASSIGNMENT_SUBJECTS.includes(input as typeof LINE_ASSIGNMENT_SUBJECTS[number])) validationError = '教科を一覧から選ぶか、教科名をそのまま送信してください。';
    else { draft.subject = input; draft.subjectOption = ''; nextStep = 'awaiting_target_class'; }
  } else if (step === 'awaiting_target_class') {
    if (['全クラス', '全体', '全クラス対象'].includes(input)) {
      draft.targetClass = 'all'; draft.subjectOption = ''; nextStep = 'awaiting_type';
    } else if (['理系クラス', '理系', '理系のみ'].includes(input)) {
      draft.targetClass = 'science';
      const choices = getLineAssignmentOptionChoices(draft);
      if (choices.length === 1) draft.subjectOption = choices[0];
      nextStep = needsLineAssignmentOption(draft) ? 'awaiting_subject_option' : 'awaiting_type';
    } else validationError = '「全クラス」または「理系クラス」を選択してください。';
  } else if (step === 'awaiting_subject_option') {
    if (!getLineAssignmentOptionChoices(draft).includes(input)) validationError = '選択区分を下のボタンから選んでください。';
    else { draft.subjectOption = input; nextStep = 'awaiting_type'; }
  } else if (step === 'awaiting_type') {
    if (['紙プリント・ノート', 'プリント', '紙'].includes(input)) { draft.assignmentType = 'paper'; nextStep = 'awaiting_title'; }
    else if (['Google Classroom', 'Classroom'].includes(input)) { draft.assignmentType = 'classroom'; nextStep = 'awaiting_title'; }
    else if (['その他・連絡', 'その他'].includes(input)) { draft.assignmentType = 'other'; nextStep = 'awaiting_title'; }
    else validationError = '課題の種類を選択してください。';
  } else if (step === 'awaiting_title') {
    if (!input) validationError = '課題名を入力してください。';
    else if (input.length > 200) validationError = '課題名は200文字以内で入力してください。';
    else { draft.title = input; nextStep = 'awaiting_details'; }
  } else if (step === 'awaiting_details') {
    if (['省略する', '省略', 'なし'].includes(input)) { draft.details = ''; nextStep = 'awaiting_deadline'; }
    else if (input.length > 5000) validationError = '課題の内容は5000文字以内で入力してください。';
    else { draft.details = input; nextStep = 'awaiting_deadline'; }
  } else if (step === 'awaiting_deadline') {
    if (['期限なし', 'なし', '設定しない'].includes(input)) { draft.dueAt = null; nextStep = 'awaiting_confirmation'; }
    else {
      const dueAt = parseLineAssignmentDueAt(input);
      if (!dueAt) validationError = '日時を読み取れませんでした。「YYYY/MM/DD HH:mm」または「M/D HH:mm」の形式で送ってください。';
      else { draft.dueAt = dueAt; nextStep = 'awaiting_confirmation'; }
    }
  } else if (step === 'awaiting_confirmation') {
    if (input === '最初からやり直す') { draft = {}; nextStep = 'awaiting_subject'; }
    else {
      const editSteps: Record<string, string> = {
        '教科を修正': 'awaiting_subject', '対象を修正': 'awaiting_target_class',
        '選択区分を修正': 'awaiting_subject_option', '種類を修正': 'awaiting_type',
        '課題名を修正': 'awaiting_title', '内容を修正': 'awaiting_details', '期限を修正': 'awaiting_deadline',
      };
      if (editSteps[input]) {
        nextStep = editSteps[input];
        if (nextStep === 'awaiting_subject' || nextStep === 'awaiting_target_class') draft.subjectOption = '';
      } else if (input === '送信する') {
        if (!draft.subject || !draft.targetClass || !draft.title || !draft.assignmentType || draft.dueAt === undefined) {
          validationError = '登録に必要な項目が不足しています。最初からやり直してください。';
        } else {
          const { data: claim, error: claimError } = await admin.from('line_assignment_sessions')
            .update({ step: 'submitting', updated_at: new Date().toISOString() })
            .eq('line_user_id', lineUserId).eq('step', 'awaiting_confirmation')
            .select('line_user_id').maybeSingle();
          if (claimError || !claim) {
            await replyPlain(replyToken, 'この課題はすでに送信処理中です。連続送信は不要です。', accessToken);
            return true;
          }
          const { error: insertError } = await admin.from('assignment_suggestions').insert({
            line_user_id: lineUserId, title: draft.title, details: draft.details || '',
            subject: draft.subject, target_class: draft.targetClass, subject_option: draft.subjectOption || '',
            type: draft.assignmentType, due_at: draft.dueAt ?? null, status: 'pending',
          });
          if (insertError) {
            console.error('LINE assignment chat suggestion insert failed:', insertError.message);
            await saveLineAssignmentSession(admin, lineUserId, 'awaiting_confirmation', draft);
            await replyPlain(replyToken, '課題を保存できませんでした。入力内容は保持しています。「送信する」をもう一度押してください。', accessToken, [{ label: '送信する', text: '送信する' }]);
            return true;
          }
          const { error: deleteError } = await admin.from('line_assignment_sessions').delete().eq('line_user_id', lineUserId);
          if (deleteError) console.error('LINE assignment chat session cleanup failed:', deleteError.message);
          await replyPlain(replyToken, '✅ 課題提案を受け付けました。\n管理者の確認・承認後にCampusSyncへ正式公開されます。登録はLINEトーク内で完了しました。', accessToken);
          return true;
        }
      } else validationError = '下のボタンから「送信する」か、修正したい項目を選んでください。';
    }
  }

  const saved = await saveLineAssignmentSession(admin, lineUserId, nextStep, draft);
  if (!saved) {
    await replyPlain(replyToken, '入力内容を保存できませんでした。通信状態を確認して、もう一度同じ内容を送ってください。', accessToken);
    return true;
  }
  await replyLineAssignmentStep(replyToken, accessToken, nextStep, draft, validationError);
  return true;
}


type LineMiniTestDraft = { subject?: string; testDate?: string; title?: string; scope?: string; notes?: string };
const LINE_MINI_TEST_SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'] as const;
function parseLineMiniTestDate(value: string): string | null {
  const normalized = value.normalize('NFKC').trim();
  let year = 0, month = 0, day = 0;
  const full = normalized.match(/^(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})$/);
  const short = normalized.match(/^(\\d{1,2})[/-](\\d{1,2})$/)
    || normalized.match(/^(\\d{1,2})月(\\d{1,2})日$/);
  if (full) { year = Number(full[1]); month = Number(full[2]); day = Number(full[3]); }
  else if (short) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).formatToParts(new Date());
    year = Number(parts.find(part => part.type === 'year')?.value || 0);
    month = Number(short[1]); day = Number(short[2]);
  } else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const key = date.toISOString().slice(0, 10);
  const todayParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const todayValues = Object.fromEntries(todayParts.map(part => [part.type, part.value]));
  const today = String(todayValues.year) + '-' + String(todayValues.month) + '-' + String(todayValues.day);
  return key >= today ? key : null;
}
function buildLineMiniTestPrompt(step: string, draft: LineMiniTestDraft): { text: string; quickReplies: AssignmentQuickReplyOption[] } {
  const choices = (values: string[]) => values.map(value => ({ label: value, text: value }));
  switch (step) {
    case 'subject':
      return { text: '📘 小テスト予定を登録します。まず教科を選んでください。', quickReplies: choices([...LINE_MINI_TEST_SUBJECTS]) };
    case 'date':
      return { text: '実施日を入力してください。\\n例：2026/11/20、11/20、11月20日', quickReplies: [] };
    case 'title':
      return { text: 'テスト名を入力してください。\\n例：英単語小テスト', quickReplies: [] };
    case 'scope':
      return { text: '出題範囲を入力してください。不要なら「範囲なし」と送信してください。', quickReplies: [{ label: '範囲なし', text: '範囲なし' }] };
    case 'notes':
      return { text: '備考があれば入力してください。なければ「なし」と送信してください。', quickReplies: [{ label: 'なし', text: 'なし' }] };
    case 'confirm':
      return {
        text: ['📝 小テスト予定の確認', '', '教科：' + (draft.subject || ''), '実施日：' + (draft.testDate || ''), 'テスト名：' + (draft.title || ''), '範囲：' + (draft.scope || 'なし'), '備考：' + (draft.notes || 'なし'), '', '送信すると先生の承認待ちになります。承認後に学校の週間予定表とLINE週間配信へ掲載されます。'].join('\\n'),
        quickReplies: [{ label: '申請する', text: '申請する' }, { label: '最初から', text: '最初からやり直す' }, { label: '中止', text: '中止' }],
      };
    default:
      return { text: '小テスト登録の状態を確認できませんでした。「CSAI 小テスト追加」と送信してやり直してください。', quickReplies: [] };
  }
}
async function saveLineMiniTestSession(admin: ReturnType<typeof getLineAssignmentAdmin> & {}, lineUserId: string, step: string, draft: LineMiniTestDraft) {
  const now = new Date();
  const { error } = await admin.from('line_mini_test_sessions').upsert({
    line_user_id: lineUserId, step, draft_data: draft,
    expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), updated_at: now.toISOString(),
  }, { onConflict: 'line_user_id' });
  if (error) console.error('LINE mini-test session save failed:', error.message);
  return !error;
}
async function replyLineMiniTestStep(replyToken: string, accessToken: string, step: string, draft: LineMiniTestDraft, prefix = '') {
  const prompt = buildLineMiniTestPrompt(step, draft);
  await replyPlain(replyToken, (prefix ? prefix + '\\n\\n' : '') + prompt.text, accessToken, prompt.quickReplies);
}
async function handleLineMiniTestContribution(event: LineTextMessageEvent, replyToken: string, messageText: string, accessToken: string): Promise<boolean> {
  if (event.source?.type !== 'user' || !event.source.userId) return false;
  const normalized = messageText.normalize('NFKC').replace(/[\\s　]/g, '').toLowerCase();
  const isStart = normalized.startsWith('csai') && /(小テスト|ミニテスト).*(追加|登録)|(追加|登録).*(小テスト|ミニテスト)/.test(normalized);
  const lineUserId = event.source.userId;
  const admin = getLineAssignmentAdmin();
  if (!admin) {
    if (isStart) await replyPlain(replyToken, '小テスト登録サービスの設定を確認できません。', accessToken);
    return isStart;
  }
  if (isStart) {
    const saved = await saveLineMiniTestSession(admin, lineUserId, 'subject', {});
    if (!saved) await replyPlain(replyToken, '小テスト登録を開始できませんでした。もう一度お試しください。', accessToken);
    else await replyLineMiniTestStep(replyToken, accessToken, 'subject', {});
    return true;
  }
  const { data: session, error } = await admin.from('line_mini_test_sessions').select('step,draft_data,expires_at').eq('line_user_id', lineUserId).maybeSingle();
  if (error) { console.error('LINE mini-test session lookup failed:', error.message); return false; }
  if (!session) return false;
  if (/^(中止|キャンセル|やめる)$/.test(normalized)) {
    await admin.from('line_mini_test_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '小テスト予定の登録を中止しました。', accessToken);
    return true;
  }
  if (Date.parse(String(session.expires_at)) <= Date.now()) {
    await admin.from('line_mini_test_sessions').delete().eq('line_user_id', lineUserId);
    await replyPlain(replyToken, '入力期限（60分）が切れました。「CSAI 小テスト追加」からやり直してください。', accessToken);
    return true;
  }
  const draft: LineMiniTestDraft = session.draft_data && typeof session.draft_data === 'object' ? { ...(session.draft_data as LineMiniTestDraft) } : {};
  const input = messageText.normalize('NFKC').trim();
  let next = String(session.step || 'subject');
  let errorMessage = '';
  if (next === 'subject') {
    if (!LINE_MINI_TEST_SUBJECTS.includes(input as typeof LINE_MINI_TEST_SUBJECTS[number])) errorMessage = '教科を一覧から選択してください。';
    else { draft.subject = input; next = 'date'; }
  } else if (next === 'date') {
    const date = parseLineMiniTestDate(input);
    if (!date) errorMessage = '日付を読み取れません。今日以降の日付を YYYY/MM/DD または M/D で入力してください。';
    else { draft.testDate = date; next = 'title'; }
  } else if (next === 'title') {
    if (!input || input.length > 160) errorMessage = 'テスト名は1〜160文字で入力してください。';
    else { draft.title = input; next = 'scope'; }
  } else if (next === 'scope') {
    if (input.length > 1200) errorMessage = '範囲は1200文字以内にしてください。';
    else { draft.scope = ['範囲なし', 'なし'].includes(input) ? '' : input; next = 'notes'; }
  } else if (next === 'notes') {
    if (input.length > 1200) errorMessage = '備考は1200文字以内にしてください。';
    else { draft.notes = ['なし', '不要'].includes(input) ? '' : input; next = 'confirm'; }
  } else if (next === 'confirm') {
    if (input === '最初からやり直す') { Object.keys(draft).forEach(key => delete (draft as Record<string, unknown>)[key]); next = 'subject'; }
    else if (input === '申請する') {
      if (!draft.subject || !draft.testDate || !draft.title) errorMessage = '必須項目が不足しています。最初からやり直してください。';
      else {
        const { data: claim, error: claimError } = await admin.from('line_mini_test_sessions').update({ step: 'submitting', updated_at: new Date().toISOString() }).eq('line_user_id', lineUserId).eq('step', 'confirm').select('line_user_id').maybeSingle();
        if (claimError || !claim) { await replyPlain(replyToken, '送信処理中です。連続送信は不要です。', accessToken); return true; }
        const { error: insertError } = await admin.from('mini_test_events').insert({
          subject: draft.subject, title: draft.title, test_date: draft.testDate, scope: draft.scope || '', notes: draft.notes || '',
          audience: 'school', status: 'pending', source: 'line', line_user_id: lineUserId,
        });
        if (insertError) {
          console.error('LINE mini-test insert failed:', insertError.message);
          await saveLineMiniTestSession(admin, lineUserId, 'confirm', draft);
          await replyPlain(replyToken, '申請を保存できませんでした。入力内容は保持しています。「申請する」をもう一度押してください。', accessToken, [{ label: '申請する', text: '申請する' }]);
          return true;
        }
        await admin.from('line_mini_test_sessions').delete().eq('line_user_id', lineUserId);
        await replyPlain(replyToken, '✅ 小テスト予定を先生へ申請しました。承認後、学校の週間予定表とLINE週間配信に掲載されます。', accessToken);
        return true;
      }
    } else errorMessage = '「申請する」または「最初から」を選択してください。';
  } else {
    next = 'subject';
    errorMessage = '入力状態を初期化しました。教科を選択してください。';
  }
  const saved = await saveLineMiniTestSession(admin, lineUserId, next, draft);
  if (!saved) { await replyPlain(replyToken, '入力内容を保存できませんでした。もう一度お試しください。', accessToken); return true; }
  await replyLineMiniTestStep(replyToken, accessToken, next, draft, errorMessage);
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
    const miniTestHandled = await handleLineMiniTestContribution(event, event.replyToken, messageText, channelAccessToken);
    if (miniTestHandled) return;
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
