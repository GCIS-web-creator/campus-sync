import { randomUUID } from 'node:crypto';

type ClubNoteLineRow = {
  id: string | number;
  club_name: string;
  title: string;
  content: string;
  author?: string | null;
  author_name?: string | null;
  created_at: string;
  line_delivery_status?: string | null;
  line_retry_key?: string | null;
  line_last_attempt_at?: string | null;
};

type SupabaseAdminClient = {
  from: (table: string) => any;
};

export type ClubNoteLineDelivery = {
  status: 'sent' | 'disabled' | 'failed' | 'already_sent';
  message: string;
};

function cleanLabel(value: unknown, fallback: string): string {
  const label = String(value || '').trim();
  if (!label || label.includes('@') || /^[0-9]{6}(?:\s*より)?$/.test(label)) return fallback;
  return label.slice(0, 50);
}

function formatJst(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Tokyo',
  }).format(date);
}

/**
 * Broadcast one persisted club/committee note to all LINE Official Account friends.
 * No LINE credentials are ever returned to the caller or written into the database.
 */
export async function broadcastClubNoteToLine(
  admin: SupabaseAdminClient,
  noteId: string | number,
): Promise<ClubNoteLineDelivery> {
  const { data: note, error: loadError } = await admin
    .from('club_notes')
    .select('id,club_name,title,content,author,author_name,created_at,line_delivery_status,line_retry_key,line_last_attempt_at')
    .eq('id', noteId)
    .maybeSingle();

  if (loadError || !note) {
    console.error('LINE連絡ノート読込エラー:', loadError?.message || 'not found');
    return { status: 'failed', message: '投稿は保存されましたが、LINE送信情報を読み込めませんでした。' };
  }

  const row = note as ClubNoteLineRow;
  if (row.line_delivery_status === 'sent') {
    return { status: 'already_sent', message: 'この投稿はすでにLINEへ送信済みです。' };
  }

  const updateStatus = async (values: Record<string, unknown>) => {
    const { error } = await admin.from('club_notes').update(values).eq('id', noteId);
    if (error) console.error('LINE送信状態の保存に失敗:', error.message);
    return !error;
  };

  if (process.env.CLUB_NOTES_LINE_BROADCAST_ENABLED !== 'true') {
    await updateStatus({
      line_delivery_status: 'disabled',
      line_delivery_error: 'CLUB_NOTES_LINE_BROADCAST_ENABLED is not true',
    });
    return { status: 'disabled', message: '投稿は保存されました。LINE自動配信はまだ有効化されていません。' };
  }

  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    await updateStatus({
      line_delivery_status: 'failed',
      line_delivery_error: 'LINE_CHANNEL_ACCESS_TOKEN is not configured',
    });
    return { status: 'failed', message: '投稿は保存されましたが、LINE_CHANNEL_ACCESS_TOKEN が未設定のため送信できませんでした。' };
  }

  const now = Date.now();
  const priorAttemptAt = row.line_last_attempt_at ? new Date(row.line_last_attempt_at).getTime() : NaN;
  const retryWindowExpired = Number.isFinite(priorAttemptAt) && now - priorAttemptAt > 23 * 60 * 60 * 1000;
  if (row.line_retry_key && retryWindowExpired && row.line_delivery_status !== 'not_sent' && row.line_delivery_status !== 'disabled') {
    return {
      status: 'failed',
      message: '前回の送信試行から約24時間が経過したため、重複配信防止のため自動再送を止めました。LINE公式アカウントの配信履歴を確認してから対応してください。',
    };
  }

  const retryKey = row.line_retry_key || randomUUID();
  const keySaved = await updateStatus({
    line_delivery_status: 'sending',
    line_retry_key: retryKey,
    line_last_attempt_at: new Date().toISOString(),
    line_delivery_error: null,
  });
  if (!keySaved) {
    return { status: 'failed', message: '投稿は保存されましたが、LINE送信状態を保存できず安全のため送信を中止しました。' };
  }

  const author = cleanLabel(row.author_name || row.author, '学校からのお知らせ');
  const text = [
    '【部活・委員会連絡】',
    row.club_name,
    '件名：' + row.title,
    '発信者：' + author,
    '投稿日時：' + formatJst(row.created_at),
    '',
    row.content,
    '',
    'CampusSync',
  ].join('\n');

  if (Array.from(text).length > 5000) {
    await updateStatus({
      line_delivery_status: 'failed',
      line_delivery_error: 'Message exceeds LINE text message length limit',
    });
    return { status: 'failed', message: '投稿は保存されましたが、LINE送信文が文字数上限を超えています。Adminで本文を短くしてください。' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify({ messages: [{ type: 'text', text }] }),
      cache: 'no-store',
    });

    // LINE returns 409 when the same retry key was already accepted.
    if (response.ok || response.status === 409) {
      const requestId = response.headers.get('x-line-request-id')
        || response.headers.get('x-line-accepted-request-id')
        || null;
      await updateStatus({
        line_delivery_status: 'sent',
        line_sent_at: new Date().toISOString(),
        line_delivery_error: null,
        line_request_id: requestId,
      });
      return {
        status: response.status === 409 ? 'already_sent' : 'sent',
        message: '投稿を保存し、LINE公式アカウントの友だちへ配信しました。',
      };
    }

    const statusMessage = 'LINE API HTTP ' + response.status;
    await updateStatus({
      line_delivery_status: 'failed',
      line_delivery_error: statusMessage,
      line_request_id: response.headers.get('x-line-request-id'),
    });
    console.error('部活投稿のLINE配信に失敗:', statusMessage);
    if (response.status === 429) {
      return { status: 'failed', message: '投稿は保存されましたがLINE配信上限に達した可能性があります。LINE公式アカウントの通数を確認してください。' };
    }
    return { status: 'failed', message: '投稿は保存されましたがLINEへの配信に失敗しました（HTTP ' + response.status + '）。Adminの配信状態を確認してください。' };
  } catch (error) {
    await updateStatus({
      line_delivery_status: 'failed',
      line_delivery_error: 'LINE request failed before a response was received',
    });
    console.error('部活投稿のLINE配信通信エラー:', error instanceof Error ? error.message : 'unknown error');
    return { status: 'failed', message: '投稿は保存されましたがLINEへの接続結果を確認できませんでした。重複配信を避けるためAdminから状態を確認してください。' };
  }
}
