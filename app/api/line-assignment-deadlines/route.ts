import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildNoticeFlexMessage } from '@/lib/line-flex';
import { pushLineMessagesToRegisteredChats, summarizeLineGroupDelivery } from '@/lib/line-group-chats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssignmentRow = {
  id: string;
  title: string;
  source?: string | null;
  type?: string | null;
  due_at: string;
  due?: string | null;
};

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function tokyoDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function formatDueAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET || '';
  const authorization = request.headers.get('authorization') || '';
  const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!configuredSecret || !providedSecret || !constantTimeEqual(configuredSecret, providedSecret)) {
    return NextResponse.json({ success: false, message: '課題の期限リマインダーの定期配信認証に失敗しました。' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    return NextResponse.json({
      success: false,
      message: 'Supabaseの設定またはLINE_CHANNEL_ACCESS_TOKENが不足しています。',
    }, { status: 503 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await admin
    .from('assignments')
    .select('id,title,source,type,due_at,due')
    .eq('is_active', true)
    .not('due_at', 'is', null)
    .gte('due_at', now.toISOString())
    .lte('due_at', horizon.toISOString())
    .order('due_at', { ascending: true });

  if (error) {
    console.error('期限が近い課題の取得に失敗:', error.message);
    return NextResponse.json({ success: false, message: 'assignmentsから期限が近い課題を取得できませんでした。' }, { status: 500 });
  }

  const assignments = (data || []) as AssignmentRow[];
  if (!assignments.length) {
    return NextResponse.json({
      success: true,
      skipped: true,
      count: 0,
      message: '今後48時間以内に期限を迎える公開中の課題がないため、グループ通知をスキップしました。',
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const lines = assignments.slice(0, 12).map((item, index) =>
    (index + 1) + '. ' + String(item.title || '課題名未設定').slice(0, 120)
      + '\n   提出期限：' + formatDueAt(item.due_at)
      + (item.source ? '\n   出典：' + String(item.source).slice(0, 60) : '')
  );
  if (assignments.length > lines.length) lines.push('ほか' + (assignments.length - lines.length) + '件あります。CampusSyncの提出物一覧を確認してください。');
  const body = '提出期限まで48時間以内の公開中の課題です。\n\n'
    + lines.join('\n\n')
    + '\n\n提出状況と詳しい指示はCampusSyncで確認してください。';
  const flex = buildNoticeFlexMessage('提出期限が近い課題', body);
  const dateKey = tokyoDateKey(now);
  const retryBase = createHash('sha256').update('campussync-assignment-deadline-reminder:' + dateKey).digest('hex');

  const groupDelivery = await pushLineMessagesToRegisteredChats(
    accessToken,
    [flex],
    retryBase,
    'assignment_updates',
  );

  return NextResponse.json({
    success: true,
    date: dateKey,
    count: assignments.length,
    groupDelivery,
    message: '期限が48時間以内に近づいている課題を確認しました。' + summarizeLineGroupDelivery(groupDelivery),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
