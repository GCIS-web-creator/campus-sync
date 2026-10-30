import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildNoticeFlexMessage, buildEmergencyNoticeFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';
import { LEGACY_SAMPLE_NOTIFICATION_TITLES } from '@/lib/school-notification-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = {
  title?: unknown;
  body?: unknown;
  imageUrl?: unknown;
  action?: unknown;
  notificationId?: unknown;
  category?: unknown;
  priority?: unknown;
};

type SchoolNotification = {
  id: string | number;
  title: string;
  body: string;
  category?: string;
  priority?: string;
  target_user_id?: string | null;
  expires_at?: string | null;
  is_pinned?: boolean;
  image_url?: string | null;
  created_at: string;
  line_sent?: boolean;
  line_sent_at?: string | null;
  line_error?: string | null;
};

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authorize(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: 'CAMPUS_SYNC_ADMIN_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY をVercelの環境変数に設定してください。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ message: 'Admin用パスワードが正しくありません。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

function validateImageUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function sendLineNotification(
  admin: ReturnType<typeof getAdminClient> & {},
  notification: SchoolNotification,
) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    const message = 'VercelにLINE_CHANNEL_ACCESS_TOKENが設定されていません。';
    const { data: updated, error } = await admin
      .from('notifications')
      .update({ line_sent: false, line_error: message })
      .eq('id', notification.id)
      .select('id, title, body, category, priority, target_user_id, expires_at, is_pinned, image_url, created_at, line_sent, line_sent_at, line_error')
      .maybeSingle();
    if (error) console.error('LINE送信失敗状態の保存に失敗:', error.message);
    return { sent: false, message, notification: updated || { ...notification, line_sent: false, line_error: message } };
  }

  try {
    const messages = [notification.priority === 'emergency'
      ? buildEmergencyNoticeFlexMessage(notification.title, notification.body, notification.image_url, notification.category)
      : buildNoticeFlexMessage(notification.title, notification.body, notification.image_url)];
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      const message = response.status === 429
        ? 'LINEの送信上限に達した可能性があります。'
        : `LINE送信失敗（HTTP ${response.status}）${detail ? `：${detail}` : ''}`;
      const { data: updated, error } = await admin
        .from('notifications')
        .update({ line_sent: false, line_error: message })
        .eq('id', notification.id)
        .select('id, title, body, image_url, created_at, line_sent, line_sent_at, line_error')
        .maybeSingle();
      if (error) console.error('LINE送信失敗状態の保存に失敗:', error.message);
      return { sent: false, message, notification: updated || { ...notification, line_sent: false, line_error: message } };
    }

    const groupDelivery = await pushLineMessagesToRegisteredChats(accessToken, messages);
    const groupSummary = summarizeLineGroupDelivery(groupDelivery);
    const sentAt = new Date().toISOString();
    const { data: updated, error } = await admin
      .from('notifications')
      .update({ line_sent: true, line_sent_at: sentAt, line_error: null })
      .eq('id', notification.id)
      .select('id, title, body, image_url, created_at, line_sent, line_sent_at, line_error')
      .maybeSingle();
    if (error) console.error('LINE送信済み状態の保存に失敗:', error.message);
    return {
      sent: true,
      message: 'LINE公式アカウントへ送信しました。 ' + groupSummary,
      notification: updated || { ...notification, line_sent: true, line_sent_at: sentAt, line_error: null },
    };
  } catch (error) {
    const message = 'LINE APIへ接続できませんでした。環境変数やLINE Developersの設定を確認してください。';
    console.error('学園総合通知のLINE送信に失敗:', error instanceof Error ? error.message : 'unknown error');
    const { data: updated, error: updateError } = await admin
      .from('notifications')
      .update({ line_sent: false, line_error: message })
      .eq('id', notification.id)
      .select('id, title, body, image_url, created_at, line_sent, line_sent_at, line_error')
      .maybeSingle();
    if (updateError) console.error('LINE送信失敗状態の保存に失敗:', updateError.message);
    return { sent: false, message, notification: updated || { ...notification, line_sent: false, line_error: message } };
  }
}

export async function GET(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  const { data, error } = await admin
    .from('notifications')
    .select('id, title, body, image_url, created_at, line_sent, line_sent_at, line_error')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('学園総合通知履歴の取得に失敗:', error.message);
    return NextResponse.json(
      { message: `通知履歴を取得できませんでした。supabase/school-notifications.sql を実行したか確認してください。詳細: ${error.message}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const notices = (data || [])
    .filter(note => !LEGACY_SAMPLE_NOTIFICATION_TITLES.has(String(note.title || '').trim()))
    .slice(0, 20);
  return NextResponse.json({ notifications: notices }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ message: '送信データを読み取れません。' }, { status: 400 });
  }
  if (!rawPayload || typeof rawPayload !== 'object') {
    return NextResponse.json({ message: '送信データの形式が不正です。' }, { status: 400 });
  }
  const payload = rawPayload as Payload;

  if (payload.action === 'retry-line') {
    const notificationId = typeof payload.notificationId === 'string' ? payload.notificationId.trim() : '';
    if (!notificationId) return NextResponse.json({ message: '再送する通知IDがありません。' }, { status: 400 });
    const { data: existing, error } = await admin
      .from('notifications')
      .select('id, title, body, image_url, created_at, line_sent, line_sent_at, line_error')
      .eq('id', notificationId)
      .maybeSingle();
    if (error || !existing) {
      return NextResponse.json(
        { message: error ? `通知を読み込めませんでした: ${error.message}` : '再送する通知が見つかりません。' },
        { status: error ? 500 : 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const delivery = await sendLineNotification(admin, existing as SchoolNotification);
    return NextResponse.json(
      {
        success: delivery.sent,
        notification: delivery.notification,
        message: delivery.sent
          ? `「${existing.title}」をLINE公式アカウントへ再送しました。`
          : `LINE再送に失敗しました。詳細: ${delivery.message}`,
      },
      { status: delivery.sent ? 200 : 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const imageUrl = validateImageUrl(payload.imageUrl);
  if (imageUrl === undefined) return NextResponse.json({ message: '画像URLはHTTPSの公開URLを指定してください。' }, { status: 400 });
  if (!title || !body) return NextResponse.json({ message: 'タイトルと本文の両方を入力してください。' }, { status: 400 });
  if (LEGACY_SAMPLE_NOTIFICATION_TITLES.has(title)) {
    return NextResponse.json({ message: '旧サンプルと同じタイトルは通知として公開できません。タイトルを変更してください。' }, { status: 400 });
  }
  if (Array.from(title).length > 100 || Array.from(body).length > 1800) {
    return NextResponse.json({ message: 'タイトルは100文字以内、本文は1,800文字以内にしてください。' }, { status: 400 });
  }

  const allowedCategories = new Set(['general', 'school_closure', 'class_change', 'early_dismissal', 'disaster', 'emergency']);
  const allowedPriorities = new Set(['normal', 'important', 'emergency']);
  const category = typeof payload.category === 'string' ? payload.category : 'general';
  const priority = typeof payload.priority === 'string' ? payload.priority : 'normal';
  if (!allowedCategories.has(category) || !allowedPriorities.has(priority)) {
    return NextResponse.json({ message: '通知の種類または重要度が不正です。' }, { status: 400 });
  }
  const isPinned = priority === 'emergency' || priority === 'important';

  const { data, error } = await admin
    .from('notifications')
    .insert({
      title,
      body,
      category,
      priority,
      is_pinned: isPinned,
      image_url: imageUrl,
      line_sent: false,
      line_error: null,
    })
    .select('id, title, body, category, priority, target_user_id, expires_at, is_pinned, image_url, created_at, line_sent, line_sent_at, line_error')
    .single();

  if (error || !data) {
    console.error('学園総合通知の公開に失敗:', error?.message || 'missing inserted row');
    return NextResponse.json(
      { message: `通知を公開できませんでした。Supabase設定を確認してください。詳細: ${error?.message || 'データが返されませんでした'}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const delivery = await sendLineNotification(admin, data as SchoolNotification);
  const message = delivery.sent
    ? `「${title}」をCampusSyncに全校公開し、LINE公式アカウントへ送信しました。`
    : `「${title}」はCampusSyncに公開しましたが、LINE送信に失敗しました。履歴の「LINE再送」から再試行できます。詳細: ${delivery.message}`;

  return NextResponse.json(
    { success: true, notification: delivery.notification, lineNotification: { sent: delivery.sent, message: delivery.message }, message },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
