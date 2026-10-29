import { createClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildNoticeFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignmentPayload = {
  id?: string;
  title?: string;
  details?: string;
  source?: string;
  type?: string;
  due?: string | null;
  due_at?: string | null;
  is_active?: boolean;
};

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unauthorizedOrMisconfigured(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ message: 'サーバー環境変数 CAMPUS_SYNC_ADMIN_PASSWORD / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を設定してください。' }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: '管理用パスワードが正しくありません。' }, { status: 401 });
  }
  return null;
}

function validatePayload(payload: AssignmentPayload): string | null {
  if (!payload.title?.trim()) return '課題名を入力してください。';
  if (payload.title.trim().length > 200) return '課題名は200文字以内にしてください。';
  if ((payload.details || '').length > 5000) return '詳細は5000文字以内にしてください。';
  if (payload.due_at && Number.isNaN(new Date(payload.due_at).getTime())) return '提出期限の日付と時刻が不正です。';
  if (payload.type && !['paper', 'classroom', 'other'].includes(payload.type)) return '課題の種類が不正です。';
  return null;
}

export async function GET(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  const { data, error } = await supabase
    .from('assignments')
    .select('id, title, details, source, type, due, due_at, is_active, created_at, classroom_course_id, classroom_coursework_id')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ message: `課題の取得に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ assignments: data || [] });
}

export async function POST(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').insert(record).select('*').single();
  if (error) return NextResponse.json({ message: `課題の保存に失敗しました: ${error.message}` }, { status: 500 });

  // Newly published assignments are announced to LINE friends as Flex Message.
  // The database write remains successful if LINE is temporarily unavailable.
  let lineNotification: { status: 'sent' | 'failed'; message: string } = {
    status: 'failed',
    message: '課題は保存しましたが、LINE通知を送信できませんでした。',
  };
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    lineNotification = {
      status: 'failed',
      message: '課題は公開されましたが、LINE_CHANNEL_ACCESS_TOKENが未設定のためLINE通知は送信されていません。',
    };
  } else {
    const typeLabel = data.type === 'paper'
      ? '紙プリント・ノート'
      : data.type === 'classroom'
        ? 'Google Classroom'
        : '連絡・アンケート';
    const dueLabel = data.due_at
      ? new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }).format(new Date(data.due_at))
      : '期限未設定';
    const noticeBody = [
      '課題名：' + data.title,
      '種類：' + typeLabel,
      '提出期限：' + dueLabel,
      data.details?.trim() ? '指示事項：\n' + data.details.trim() : '',
    ].filter(Boolean).join('\n\n').slice(0, 1800);

    try {
      const retryKey = randomUUID();
      const messages = [buildNoticeFlexMessage('新しい課題が公開されました', noticeBody)];
      const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, messages, retryKey, 'assignment_updates');
      const groupSummary = summarizeLineGroupDelivery(groupDelivery);
      const lineResponse = await fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'X-Line-Retry-Key': retryKey,
        },
        body: JSON.stringify({ messages }),
        cache: 'no-store',
      });

      if (lineResponse.ok) {
        lineNotification = {
          status: 'sent',
          message: 'LINE公式アカウントへFlex Messageで課題のお知らせを送信しました。 ' + groupSummary,
        };
      } else {
        console.error('課題公開のLINE通知に失敗:', lineResponse.status);
        lineNotification = {
          status: 'failed',
          message: lineResponse.status === 429
            ? '課題は公開されましたが、LINEの送信上限に達した可能性があります。'
            : `課題は公開されましたが、LINE友だち向け通知に失敗しました（HTTP ${lineResponse.status}）。グループ配信結果：${groupSummary}`,
        };
      }
    } catch (lineError) {
      console.error('課題公開のLINE通知接続エラー:', lineError instanceof Error ? lineError.message : 'unknown error');
      lineNotification = {
        status: 'failed',
        message: '課題は公開されましたが、LINE友だち向け通知の接続に失敗しました。グループ配信結果：' + groupSummary + ' Vercelのログを確認してください。',
      };
    }
  }

  return NextResponse.json({ assignment: data, lineNotification }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: AssignmentPayload;
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '編集対象の課題IDがありません。' }, { status: 400 });
  const validationError = validatePayload(payload);
  if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

  const record = {
    title: payload.title!.trim(),
    details: (payload.details || '').trim(),
    source: payload.source || 'Admin／先生',
    type: payload.type || 'paper',
    due: payload.due_at ? '期限あり' : '期限未設定',
    due_at: payload.due_at || null,
    is_active: payload.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('assignments').update(record).eq('id', payload.id).select('*').maybeSingle();
  if (error) return NextResponse.json({ message: `課題の更新に失敗しました: ${error.message}` }, { status: 500 });
  if (!data) return NextResponse.json({ message: '対象の課題が見つかりません。' }, { status: 404 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(request: Request) {
  const authError = unauthorizedOrMisconfigured(request);
  if (authError) return authError;
  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let payload: { id?: string };
  try { payload = await request.json(); } catch { return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 }); }
  if (!payload.id) return NextResponse.json({ message: '削除対象の課題IDがありません。' }, { status: 400 });
  const { error } = await supabase.from('assignments').delete().eq('id', payload.id);
  if (error) return NextResponse.json({ message: `課題の削除に失敗しました: ${error.message}` }, { status: 500 });
  return NextResponse.json({ success: true });
}
