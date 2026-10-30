import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type LineChatSource = {
  type?: string;
  groupId?: string;
  roomId?: string;
};

type RegisteredChat = { chat_id: string; chat_type: string };
type LineGroupDeliveryKind = 'general' | 'train_timetable' | 'class_timetable' | 'school_schedule' | 'cafeteria_sold_out' | 'assignment_updates' | 'quick_notice' | 'daily_digest';

export type LineGroupDeliveryResult = {
  kind: LineGroupDeliveryKind;
  registered: number;
  sent: number;
  failed: number;
  lookupError?: string;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** IDs are recorded only from LINE webhook events whose signature was verified. */
export async function rememberLineChatEvent(source: LineChatSource | undefined, eventType: string): Promise<void> {
  if (!source || (source.type !== 'group' && source.type !== 'room')) return;
  const chatId = source.type === 'group' ? source.groupId : source.roomId;
  if (!chatId || chatId.length > 200) return;

  const admin = getAdminClient();
  if (!admin) {
    console.error('LINEグループIDを保存できません: Supabaseのサーバー設定がありません。');
    return;
  }

  const now = new Date().toISOString();
  if (eventType === 'leave') {
    // Keep the ID for troubleshooting even if the bot leaves before a prior join
    // event could be saved. Inactive chats are never used as delivery targets.
    const { error } = await admin.from('line_group_chats').upsert({
      chat_id: chatId,
      chat_type: source.type,
      active: false,
      last_seen_at: now,
      last_event_type: eventType,
    }, { onConflict: 'chat_id' });
    if (error) console.error('LINEグループの退出状態を保存できません:', error.message);
    return;
  }

  const { error } = await admin.from('line_group_chats').upsert({
    chat_id: chatId,
    chat_type: source.type,
    active: true,
    last_seen_at: now,
    last_event_type: eventType.slice(0, 80),
  }, { onConflict: 'chat_id' });
  if (error) console.error('LINEグループIDを保存できません:', error.message);
}

function retryKeyForChat(base: string, chatId: string): string {
  const chars = createHash('sha256').update('campussync-line-group:' + base + ':' + chatId)
    .digest('hex').slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const value = chars.join('');
  return value.slice(0, 8) + '-' + value.slice(8, 12) + '-' + value.slice(12, 16)
    + '-' + value.slice(16, 20) + '-' + value.slice(20);
}

/**
 * Copies a message already broadcast to LINE friends to every active group/room
 * found through webhook events. The caller still sends the original broadcast.
 */
export async function pushLineMessagesToRegisteredChats(
  accessToken: string,
  messages: unknown[],
  retryKeyBase?: string,
  kind: LineGroupDeliveryKind = 'general',
): Promise<LineGroupDeliveryResult> {
  const admin = getAdminClient();
  if (!admin) return { kind, registered: 0, sent: 0, failed: 0, lookupError: 'Supabaseのサーバー設定がありません。' };

  const preferenceColumn = kind === 'train_timetable'
    ? 'receive_train_timetable'
    : kind === 'class_timetable'
      ? 'receive_class_timetable'
      : kind === 'school_schedule'
        ? 'receive_school_schedule'
        : kind === 'cafeteria_sold_out'
        ? 'receive_cafeteria_sold_out'
        : kind === 'assignment_updates'
          ? 'receive_assignment_updates'
          : kind === 'quick_notice'
            ? 'receive_quick_notices'
            : 'receive_general_notifications';
  const activeChatsQuery = admin.from('line_group_chats')
    .select('chat_id,chat_type')
    .eq('active', true);
  const { data, error } = kind === 'daily_digest'
    ? await activeChatsQuery.or(
        'receive_train_timetable.eq.true,receive_class_timetable.eq.true,receive_school_schedule.eq.true,receive_assignment_updates.eq.true',
      )
    : await activeChatsQuery.eq(preferenceColumn, true);
  if (error) {
    console.error('LINEグループ配信先の取得に失敗:', error.message);
    return { kind, registered: 0, sent: 0, failed: 0, lookupError: error.message };
  }

  const chats = (data || []) as RegisteredChat[];
  const outcomes = await Promise.all(chats.map(async chat => {
    try {
      const headers: Record<string, string> = {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      };
      if (retryKeyBase) headers['X-Line-Retry-Key'] = retryKeyForChat(retryKeyBase, chat.chat_id);
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: chat.chat_id, messages }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok || response.status === 409) return true;
      // Preserve LINE's error message for diagnosing 429 quota/rate-limit failures.
      const errorBody = await response.text().catch(() => '');
      console.error('LINEグループへの送信に失敗:', {
        chatType: chat.chat_type,
        status: response.status,
        requestId: response.headers.get('x-line-request-id') || response.headers.get('x-line-accepted-request-id') || undefined,
        error: errorBody.slice(0, 500) || undefined,
      });
      return false;
    } catch (error) {
      console.error('LINEグループ送信の通信エラー:', error instanceof Error ? error.message : 'unknown error');
      return false;
    }
  }));

  const sent = outcomes.filter(Boolean).length;
  return { kind, registered: chats.length, sent, failed: chats.length - sent };
}

export function summarizeLineGroupDelivery(result: LineGroupDeliveryResult): string {
  if (result.lookupError) return 'グループ配信先を確認できませんでした。Supabaseのグループ用SQL設定を確認してください。';
  if (result.registered === 0) return result.kind === 'train_timetable'
    ? '時刻表専用に設定されたLINEグループはありません（receive_train_timetable を確認してください）。'
    : result.kind === 'class_timetable'
      ? '時間割専用に設定されたLINEグループはありません（receive_class_timetable を確認してください）。'
      : result.kind === 'school_schedule'
        ? '週間学校予定表を受信するLINEグループはありません（receive_school_schedule を確認してください）。'
        : result.kind === 'cafeteria_sold_out'
        ? '学食売切通知を受信するLINEグループはありません（receive_cafeteria_sold_out を確認してください）。'
        : result.kind === 'assignment_updates'
          ? '課題の公開・期限リマインダーを受信するLINEグループはありません（receive_assignment_updates を確認してください）。'
          : result.kind === 'quick_notice'
            ? 'クイックお知らせ・パトロールを受信するLINEグループはありません（receive_quick_notices を確認してください）。'
            : result.kind === 'daily_digest'
              ? '日次まとめを受信する設定のLINEグループはありません（時間割・時刻表・課題・学校予定の受信設定を確認してください）。'
              : '一般通知を受信するLINEグループはありません（初期状態では配信しません）。';
  if (result.failed > 0) return 'LINEグループ配信は' + result.sent + '/' + result.registered + '件成功、' + result.failed + '件失敗しました。';
  return result.kind === 'train_timetable'
    ? '時刻表専用に設定されたLINEグループ' + result.sent + '件にも配信しました。'
    : result.kind === 'class_timetable'
      ? '時間割専用に設定されたLINEグループ' + result.sent + '件にも配信しました。'
      : result.kind === 'school_schedule'
      ? '週間学校予定表を受信するLINEグループ' + result.sent + '件にも配信しました。'
    : result.kind === 'cafeteria_sold_out'
        ? '学食売切通知を受信するLINEグループ' + result.sent + '件にも配信しました。'
        : result.kind === 'assignment_updates'
          ? '課題通知を受信するLINEグループ' + result.sent + '件にも配信しました。'
          : result.kind === 'quick_notice'
            ? 'クイックお知らせ・パトロールを受信するLINEグループ' + result.sent + '件にも配信しました。'
            : '一般通知を受信する設定のLINEグループ' + result.sent + '件にも配信しました。';
}
