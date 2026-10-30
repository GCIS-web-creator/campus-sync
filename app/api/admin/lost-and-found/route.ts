import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildLostFoundApprovedFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LostFoundRow = {
  id: string | number;
  title: string;
  location: string;
  description?: string | null;
  finder?: string | null;
  student_id?: string | null;
  status: 'pending' | 'approved' | 'returned';
  contribution_awarded_at?: string | null;
};

function isAuthorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function configError() {
  return NextResponse.json({
    success: false,
    message: 'CAMPUS_SYNC_ADMIN_PASSWORD、NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEYをVercelの環境変数に設定してください。',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}

function authError(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: '管理用パスワードが正しくありません。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return '日時不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function getTokyoDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}




async function notifyMatchingLostFoundWatches(
  admin: ReturnType<typeof getAdminClient> & {},
  item: LostFoundRow,
): Promise<{ matchedUsers: number; pushSent: number; message: string }> {
  const { data: watches, error } = await admin
    .from('lost_found_watches')
    .select('user_id, keyword')
    .eq('is_active', true);

  if (error) {
    console.error('落とし物通知キーワードを取得できません:', error.message);
    return { matchedUsers: 0, pushSent: 0, message: '落とし物通知キーワードを読み込めませんでした。' };
  }

  const searchable = [item.title, item.location, item.description || '']
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase();
  const matchedByUser = new Map<string, string[]>();
  for (const watch of watches || []) {
    const keyword = String(watch.keyword || '').trim();
    if (keyword.length < 2) continue;
    if (!searchable.includes(keyword.normalize('NFKC').toLocaleLowerCase())) continue;
    const list = matchedByUser.get(String(watch.user_id)) || [];
    if (!list.includes(keyword)) list.push(keyword);
    matchedByUser.set(String(watch.user_id), list);
  }

  if (matchedByUser.size === 0) {
    return { matchedUsers: 0, pushSent: 0, message: '' };
  }

  const itemTitle = String(item.title || '落とし物').slice(0, 100);
  const itemLocation = String(item.location || '場所不明').slice(0, 100);
  const targetRows = Array.from(matchedByUser.entries()).map(([userId, keywords]) => ({
    target_user_id: userId,
    title: '探している物に一致する可能性があります',
    body: '事務室で確認・公開された「' + itemTitle + '」が、登録したキーワード（' +
      keywords.slice(0, 4).join('、') + '）に一致しました。場所：' + itemLocation +
      '。本人の物かどうか、詳細を確認してください。',
    category: 'lost_found_match',
    priority: 'important',
    is_pinned: false,
  }));

  const { error: insertError } = await admin.from('notifications').insert(targetRows);
  if (insertError) {
    console.error('落とし物の個別通知を保存できません:', insertError.message);
    return { matchedUsers: 0, pushSent: 0, message: '一致した通知を保存できませんでした。' };
  }

  let pushSent = 0;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
    try {
      const userIds = Array.from(matchedByUser.keys());
      const [{ data: subscriptions, error: subscriptionError }, { data: preferences, error: preferenceError }] = await Promise.all([
        admin.from('push_subscriptions').select('user_id, endpoint, subscription').in('user_id', userIds),
        admin.from('push_reminder_preferences').select('user_id, notification_settings').in('user_id', userIds),
      ]);

      if (subscriptionError) {
        console.error('落とし物一致通知のPush登録を取得できません:', subscriptionError.message);
      } else if (!preferenceError) {
        const preferenceByUser = new Map<string, Record<string, unknown>>();
        for (const preference of preferences || []) {
          preferenceByUser.set(String(preference.user_id), preference.notification_settings || {});
        }
        webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

        const eligibleSubscriptions = (subscriptions || []).filter(subscription => {
          const settings = preferenceByUser.get(String(subscription.user_id));
          return settings?.activity_updates !== false;
        });
        const results = await Promise.allSettled(eligibleSubscriptions.map(subscription => webpush.sendNotification(
          subscription.subscription,
          JSON.stringify({
            title: 'CampusSync｜探している物に一致する可能性があります',
            body: '登録したキーワードに一致する落とし物が公開されました。CampusSyncの通知を確認してください。',
            url: '/#notifications',
            tag: 'lost-found-match-' + String(item.id),
          }),
          { TTL: 60 * 60 * 24 * 3, urgency: 'normal' },
        )));
        pushSent = results.filter(result => result.status === 'fulfilled').length;
        await Promise.all(results.map(async (result, index) => {
          if (result.status !== 'rejected') return;
          const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            const subscription = eligibleSubscriptions[index];
            if (subscription?.endpoint) {
              await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
            }
          } else {
            console.error('落とし物一致通知のPush送信に失敗:', result.reason);
          }
        }));
      } else {
        console.error('落とし物一致通知のPush設定を取得できません:', preferenceError.message);
      }
    } catch (pushError) {
      console.error('落とし物一致通知のPush処理に失敗:', pushError instanceof Error ? pushError.message : 'unknown error');
    }
  }

  return {
    matchedUsers: matchedByUser.size,
    pushSent,
    message: '登録キーワードに一致した生徒' + matchedByUser.size + '名へ個別通知を作成しました。' +
      (pushSent ? ' ブラウザーPush ' + pushSent + '件を送信しました。' : ''),
  };
}

export async function GET(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return configError();
  const denied = authError(request);
  if (denied) return denied;
  const admin = getAdminClient();
  if (!admin) return configError();

  const { data, error } = await admin.from('lost_and_found').select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('落とし物管理一覧の読み込みに失敗:', error.message);
    return NextResponse.json({ success: false, message: 'lost_and_foundテーブルを読み込めません。先にsupabase/lost-found-line-flex-hourly.sqlを実行してください。' }, { status: 500 });
  }

  const rows = (data || []) as Array<LostFoundRow & { created_at?: string }>;
  const studentIds = Array.from(new Set(rows.map(row => String(row.student_id || '')).filter(id => /^\d{6}$/.test(id))));
  const reporterById = new Map<string, string>();
  if (studentIds.length) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('student_id,student_name,user_class')
      .in('student_id', studentIds);
    if (profilesError) {
      console.error('落とし物報告者プロフィールの取得に失敗:', profilesError.message);
    } else {
      for (const profile of profiles || []) {
        const name = String(profile.student_name || '').trim();
        const schoolClass = String(profile.user_class || '').trim();
        reporterById.set(String(profile.student_id), [schoolClass, name].filter(Boolean).join(' ') || ('学籍番号 ' + profile.student_id));
      }
    }
  }
  const items = rows.map(row => ({
    ...row,
    reporter: reporterById.get(String(row.student_id || '')) || (row.student_id ? '学籍番号 ' + row.student_id : '事務室で直接回収'),
    date: formatDate(row.created_at),
  }));
  return NextResponse.json({ success: true, items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return configError();
  const denied = authError(request);
  if (denied) return denied;
  const admin = getAdminClient();
  if (!admin) return configError();

  const body = await request.json().catch(() => null) as { id?: string | number; action?: string } | null;
  if ((typeof body?.id !== 'string' && typeof body?.id !== 'number') || !['approve', 'return', 'notify'].includes(String(body?.action))) {
    return NextResponse.json({ success: false, message: '対象IDまたは操作が不正です。' }, { status: 400 });
  }

  const { data: existing, error: loadError } = await admin
    .from('lost_and_found')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();
  if (loadError) {
    console.error('落とし物レコードの読込に失敗:', loadError.message);
    return NextResponse.json({ success: false, message: '落とし物データを読み込めませんでした。' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ success: false, message: '対象の落とし物が見つかりません。' }, { status: 404 });

  const row = existing as LostFoundRow;
  const manualNotify = body.action === 'notify';
  let updated = row;
  if (body.action === 'approve' || manualNotify) {
    let newlyApproved = false;
    if (manualNotify) {
      if (row.status !== 'approved') {
        return NextResponse.json({ success: false, message: '公開済みの落とし物だけLINE通知を再送できます。' }, { status: 409 });
      }
    } else if (row.status === 'pending') {
      const { data, error } = await admin.from('lost_and_found')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', body.id).eq('status', 'pending').select('*').maybeSingle();
      if (error || !data) {
        return NextResponse.json({ success: false, message: error?.message || '状態が更新されました。一覧を再読み込みしてください。' }, { status: 409 });
      }
      updated = data as LostFoundRow;
      newlyApproved = true;
    } else if (row.status !== 'approved') {
      return NextResponse.json({ success: false, message: '返却済みの落とし物は再公開できません。' }, { status: 409 });
    }

    let contributionAwarded = Boolean(updated.contribution_awarded_at);
    let contributionMessage = '';
    if (!manualNotify) {
    const studentId = String(updated.student_id || '').trim();
    if (!contributionAwarded && /^\d{6}$/.test(studentId)) {
      const { data: current, error: scoreReadError } = await admin
        .from('contribution_scores').select('*').eq('student_id', studentId).maybeSingle();
      if (scoreReadError) {
        console.error('落とし物承認時の貢献度取得に失敗:', scoreReadError.message);
        contributionMessage = '公開しましたが貢献度を読み込めませんでした。';
      } else {
        const todayScoreDate = getTokyoDateKey();
        const todayStart = new Date(`${todayScoreDate}T00:00:00+09:00`).toISOString();
        const todayEnd = new Date(new Date(todayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
        let scoreBefore = current?.score_date === todayScoreDate ? Number(current.score) || 0 : 0;
        if (current?.score_date !== todayScoreDate) {
          const { data: todaysHistory, error: todaysHistoryError } = await admin
            .from('contribution_history')
            .select('delta')
            .eq('student_id', studentId)
            .gte('created_at', todayStart)
            .lt('created_at', todayEnd);
          if (!todaysHistoryError) {
            scoreBefore = Math.min(100, Math.max(0,
              (todaysHistory ?? []).reduce((sum, item) => sum + (Number(item.delta) || 0), 0)
            ));
          } else {
            console.error('落とし物承認時に本日の貢献度履歴を取得できません:', todaysHistoryError.message);
          }
        }
        const scoreAfter = Math.min(100, Math.max(0, scoreBefore + 12));
        const awardedAt = new Date().toISOString();
        let { error: scoreError } = await admin.from('contribution_scores').upsert({
          student_id: studentId, score: scoreAfter, score_date: todayScoreDate, updated_at: awardedAt,
        }, { onConflict: 'student_id' });
        if (scoreError) {
          const legacySave = await admin.from('contribution_scores').upsert({
            student_id: studentId, score: scoreAfter, updated_at: awardedAt,
          }, { onConflict: 'student_id' });
          scoreError = legacySave.error;
        }
        if (scoreError) {
          console.error('落とし物承認時の貢献度保存に失敗:', scoreError.message);
          contributionMessage = '公開しましたが貢献度を保存できませんでした。';
        } else {
          const { error: markerError } = await admin.from('lost_and_found')
            .update({ contribution_awarded_at: awardedAt }).eq('id', body.id);
          if (markerError) {
            console.error('落とし物貢献度の重複防止マーカー保存に失敗:', markerError.message);
            contributionMessage = '公開・加算は完了しましたが、重複防止記録の保存に失敗しました。';
          } else {
            contributionAwarded = true;
          }
          const { error: historyError } = await admin.from('contribution_history').insert({
            student_id: studentId, delta: scoreAfter - scoreBefore,
            reason: '落とし物報告が事務室で承認されました', score_after: scoreAfter,
          });
          if (historyError) console.error('落とし物承認の貢献度履歴保存に失敗:', historyError.message);
        }
      }
    } else if (!contributionAwarded) {
      contributionMessage = '投稿者の学籍番号が記録されていないため、貢献度は加算していません。';
    }
    }

    let lineNotificationMessage = '';
    if (newlyApproved || manualNotify) {
      const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!accessToken) {
        lineNotificationMessage = 'LINE通知は未送信です。VercelのLINE_CHANNEL_ACCESS_TOKENを確認してください。';
      } else {
        const approvedAt = String((updated as any).approved_at || new Date().toISOString());
        const approvedJst = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(approvedAt));
        const flex = buildLostFoundApprovedFlexMessage({
          title: updated.title,
          location: updated.location,
          storage: updated.finder,
          description: updated.description,
          approvedAt: approvedJst,
        });
        const digest = createHash('sha256')
          .update('campussync-lost-found-approved:' + String(updated.id) + ':' + approvedAt)
          .digest('hex')
          .slice(0, 32)
          .split('');
        digest[12] = '4';
        digest[16] = ((parseInt(digest[16], 16) & 3) | 8).toString(16);
        const hex = digest.join('');
        const retryKey = manualNotify
          ? randomUUID()
          : hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
        try {
          const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + accessToken,
              'Content-Type': 'application/json',
              'X-Line-Retry-Key': retryKey,
            },
            body: JSON.stringify({ messages: [flex] }),
            cache: 'no-store',
          });
          const responseText = await response.text();
          let responseBody: any = null;
          try {
            responseBody = responseText ? JSON.parse(responseText) : null;
          } catch {
            responseBody = null;
          }
          if (response.ok || response.status === 409) {
            const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, [flex], retryKey);
            const groupSummary = summarizeLineGroupDelivery(groupDelivery);
            lineNotificationMessage = (manualNotify
              ? 'LINEに落とし物のお知らせを再送しました。'
              : 'LINEにも公開のお知らせをFlex Messageで送信しました。') + ' ' + groupSummary;
          } else {
            const apiMessage = String(responseBody?.message || '').trim();
            const detailMessages = Array.isArray(responseBody?.details)
              ? responseBody.details.map((detail: any) => String(detail?.message || '')).filter(Boolean).join(' / ')
              : '';
            const detail = [apiMessage, detailMessages].filter(Boolean).join('：').slice(0, 240);
            console.error('落とし物公開のLINE通知に失敗:', {
              status: response.status,
              message: apiMessage || undefined,
              details: detailMessages || undefined,
            });
            lineNotificationMessage = 'LINE通知に失敗しました（HTTP ' + response.status + (detail ? '：' + detail : '') + '）。Adminで通知を再送できます。';
          }
        } catch (error) {
          console.error('落とし物公開のLINE通知通信エラー:', error instanceof Error ? error.message : 'unknown error');
          lineNotificationMessage = 'ただし、LINE通知の接続に失敗しました。Vercelのログを確認してください。';
        }
      }
    }

    let lostWatchMessage = '';
    if (newlyApproved) {
      const matching = await notifyMatchingLostFoundWatches(admin, updated);
      lostWatchMessage = matching.message;
      if (matching.message) console.info('落とし物一致通知:', matching);
    }

    const summaryMessage = manualNotify
      ? lineNotificationMessage || 'LINE通知を再送できませんでした。'
      : '実物確認済みとして全体公開しました。'
        + (contributionMessage || (contributionAwarded ? '投稿者に貢献度を加算しました。' : ''))
        + (lineNotificationMessage ? ' ' + lineNotificationMessage : '')
        + (lostWatchMessage ? ' ' + lostWatchMessage : '');
    return NextResponse.json({
      success: true, item: updated, contributionAwarded,
      lineNotification: (newlyApproved || manualNotify)
        ? (lineNotificationMessage.startsWith('LINEにも') || lineNotificationMessage.startsWith('LINEに落とし物') ? 'sent' : 'failed')
        : 'not-needed',
      message: summaryMessage,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (row.status !== 'approved') {
    return NextResponse.json({ success: false, message: '公開中の落とし物のみ返却完了にできます。' }, { status: 409 });
  }
  const { data, error } = await admin.from('lost_and_found')
    .update({ status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', body.id).eq('status', 'approved').select('*').maybeSingle();
  if (error || !data) {
    return NextResponse.json({ success: false, message: error?.message || '状態が更新されました。再読み込みしてください。' }, { status: 409 });
  }
  return NextResponse.json({
    success: true, item: data,
    message: '返却完了に変更しました。生徒用の公開一覧からも非表示になります。',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
