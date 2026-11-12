import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getActiveLineBot } from '@/lib/line-bot-rotation';
import { pushLineMessagesToRegisteredChats } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const REMINDERS = {
  'cooking-20261118-2000': {
    scheduledAt: '2026-11-18T11:00:00.000Z',
  },
  'cooking-20261119-0600': {
    scheduledAt: '2026-11-18T21:00:00.000Z',
  },
} as const;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET || '';
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stableUuid(value: string): string {
  const chars = createHash('sha256').update('campussync-line-reminder:' + value).digest('hex')
    .slice(0, 32).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16)
    + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

function buildCookingReminderMessage() {
  return {
    type: 'flex',
    altText: 'CampusSync｜調理実習の持ち物リマインド',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1D4ED8',
        paddingAll: '20px',
        spacing: 'sm',
        contents: [
          { type: 'text', text: 'CAMPUSSYNC｜SOKA HIGH SCHOOL', color: '#DBEAFE', size: 'xs', weight: 'bold' },
          { type: 'text', text: '🍳 調理実習のお知らせ', color: '#FFFFFF', size: 'xl', weight: 'bold', wrap: true },
          { type: 'text', text: '11月19日（木）', color: '#DBEAFE', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        spacing: 'lg',
        contents: [
          { type: 'text', text: '忘れ物はない？', color: '#0F172A', size: 'lg', weight: 'bold', wrap: true },
          { type: 'text', text: '調理実習の持ち物を確認しよう！', color: '#475569', size: 'sm', wrap: true },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F8FAFC',
            cornerRadius: 'lg',
            paddingAll: '16px',
            spacing: 'md',
            contents: [
              { type: 'text', text: '□  エプロン', color: '#0F172A', size: 'md', weight: 'bold' },
              { type: 'separator', color: '#E2E8F0' },
              { type: 'text', text: '□  三角巾', color: '#0F172A', size: 'md', weight: 'bold' },
              { type: 'separator', color: '#E2E8F0' },
              { type: 'text', text: '□  清潔な手拭きタオル', color: '#0F172A', size: 'md', weight: 'bold', wrap: true },
              { type: 'separator', color: '#E2E8F0' },
              { type: 'text', text: '□  布巾', color: '#0F172A', size: 'md', weight: 'bold' },
              { type: 'separator', color: '#E2E8F0' },
              { type: 'text', text: '□  ビニール袋', color: '#0F172A', size: 'md', weight: 'bold' },
            ],
          },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#EFF6FF',
            cornerRadius: 'md',
            paddingAll: '12px',
            contents: [
              { type: 'text', text: '出発前に5点そろっているか確認しよう！', color: '#1E40AF', size: 'sm', weight: 'bold', wrap: true },
            ],
          },
        ],
      },
    },
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({})) as { reminderId?: unknown };
  const reminderId = typeof payload.reminderId === 'string' ? payload.reminderId : '';
  const reminder = REMINDERS[reminderId as keyof typeof REMINDERS];
  if (!reminder) {
    return NextResponse.json({ success: false, message: '対象のリマインドが見つかりません。' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Supabaseのサーバー設定が不足しています。' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const now = new Date();
  const scheduledAt = new Date(reminder.scheduledAt);
  if (now.getTime() < scheduledAt.getTime()) {
    return NextResponse.json({ success: false, message: '配信予定時刻より前のため送信しません。' }, { status: 409 });
  }
  if (now.getTime() > scheduledAt.getTime() + 48 * 60 * 60 * 1000) {
    return NextResponse.json({ success: false, message: '配信予定日時を過ぎているため送信しません。' }, { status: 410 });
  }

  const { error: insertError } = await admin.from('line_scheduled_reminder_deliveries').insert({
    reminder_id: reminderId,
    scheduled_at: reminder.scheduledAt,
    status: 'processing',
    updated_at: now.toISOString(),
  });

  if (insertError) {
    if (insertError.code !== '23505') {
      console.error('LINEリマインドの送信記録を作成できません:', insertError.message);
      return NextResponse.json({ success: false, message: '送信記録を作成できませんでした。' }, { status: 500 });
    }
    const { data: existing, error: readError } = await admin.from('line_scheduled_reminder_deliveries')
      .select('status')
      .eq('reminder_id', reminderId)
      .maybeSingle();
    if (readError) return NextResponse.json({ success: false, message: '送信状態を確認できませんでした。' }, { status: 500 });
    if (existing?.status === 'sent' || existing?.status === 'processing') {
      return NextResponse.json({ success: true, skipped: true, status: existing.status, message: 'このリマインドは送信済み、または送信処理中です。' });
    }
    const { data: claimed, error: claimError } = await admin.from('line_scheduled_reminder_deliveries')
      .update({ status: 'processing', error_message: null, updated_at: now.toISOString() })
      .eq('reminder_id', reminderId)
      .eq('status', 'failed')
      .select('reminder_id')
      .maybeSingle();
    if (claimError || !claimed) {
      return NextResponse.json({ success: false, skipped: true, message: '再送信の権利を取得できませんでした。' }, { status: 409 });
    }
  }

  try {
    const bot = await getActiveLineBot();
    if (!bot?.accessToken) throw new Error('現在使用中のLINE BOTアクセストークンが設定されていません。');

    const retryKey = stableUuid(reminderId);
    const delivery = await pushLineMessagesToRegisteredChats(
      bot.accessToken,
      [buildCookingReminderMessage()],
      retryKey,
      'quick_notice',
      retryKey,
    );

    if (delivery.sent < 1 || delivery.failed > 0) {
      throw new Error(
        delivery.lookupError
          || (delivery.registered === 0
            ? '有効なLINEグループが登録されていません。'
            : 'LINEグループへの送信に失敗しました。成功 ' + delivery.sent + ' / 登録 ' + delivery.registered),
      );
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await admin.from('line_scheduled_reminder_deliveries')
      .update({
        status: 'sent',
        sent_at: sentAt,
        bot_slot: bot.slot > 0 ? bot.slot : null,
        registered_chats: delivery.registered,
        sent_chats: delivery.sent,
        failed_chats: delivery.failed,
        error_message: null,
        updated_at: sentAt,
      })
      .eq('reminder_id', reminderId);
    if (updateError) console.error('LINEリマインドの送信結果を保存できません:', updateError.message);

    return NextResponse.json({
      success: true,
      reminderId,
      sent: delivery.sent,
      registered: delivery.registered,
      failed: delivery.failed,
      message: '調理実習の持ち物リマインドを登録済みLINEグループへ送信しました。',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LINEリマインドの送信に失敗しました。';
    await admin.from('line_scheduled_reminder_deliveries')
      .update({ status: 'failed', error_message: message.slice(0, 800), updated_at: new Date().toISOString() })
      .eq('reminder_id', reminderId);
    console.error('LINE scheduled reminder failed:', message);
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
