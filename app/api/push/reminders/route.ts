import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RULES = ['twoDaysBefore', 'dayBefore', 'morningOf', 'threeHoursBefore'] as const;
type ReminderRule = (typeof RULES)[number];
type LocalParts = { date: string; weekday: string; hour: number; minute: number };
type TodoRow = { id: string | number; student_id: string; title: string; due_at: string; completed: boolean };
type PreferenceRow = { user_id: string; student_id: string; reminders_enabled: boolean; reminder_times: string[]; allowed_days: string[]; timezone: string; notification_settings: Record<string, unknown> | null; quiet_hours_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string };
type SubscriptionRow = { endpoint: string; user_id: string; student_id: string; subscription: Parameters<typeof webpush.sendNotification>[0] };

function localParts(date: Date, timezone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function isReminderDue(rule: ReminderRule, dueAt: string, now: Date, timezone: string, allowedDays: string[]): boolean {
  const current = localParts(now, timezone);
  if (!allowedDays.includes(current.weekday)) return false;
  const dueDate = localParts(new Date(dueAt), timezone).date;

  if (rule === 'twoDaysBefore') {
    return current.date === shiftCalendarDate(dueDate, -2) && current.hour === 20 && current.minute < 5;
  }
  if (rule === 'dayBefore') {
    return current.date === shiftCalendarDate(dueDate, -1) && current.hour === 20 && current.minute < 5;
  }
  if (rule === 'morningOf') {
    return current.date === dueDate && current.hour === 7 && current.minute < 5;
  }
  const target = new Date(dueAt).getTime() - 3 * 60 * 60 * 1000;
  return now.getTime() >= target && now.getTime() < target + 5 * 60 * 1000;
}

function isWithinQuietHours(now: Date, timezone: string, enabled: boolean, startValue: string, endValue: string): boolean {
  if (!enabled) return false;
  const toMinutes = (value: string): number | null => {
    const match = /^(\\d{2}):(\\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const start = toMinutes(startValue);
  const end = toMinutes(endValue);
  if (start === null || end === null || start === end) return false;
  const local = localParts(now, timezone);
  const current = local.hour * 60 + local.minute;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'SUPABASE_SERVICE_ROLE_KEYまたはSupabase URLが未設定です。' }, { status: 500 });
    }
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return NextResponse.json({ success: false, message: 'VAPIDキーが未設定です。' }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const now = new Date();
    const { data: todos, error: todoError } = await admin
      .from('todos')
      .select('id, student_id, title, due_at, completed')
      .eq('completed', false)
      .not('due_at', 'is', null)
      .gte('due_at', new Date(now.getTime() - 5 * 60 * 1000).toISOString())
      .lte('due_at', new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString());
    if (todoError) throw new Error(`todosを取得できません: ${todoError.message}. setup_web_push_reminders.sqlを先に実行してください。`);

    const { data: preferences, error: preferenceError } = await admin
      .from('push_reminder_preferences')
      .select('user_id, student_id, reminders_enabled, reminder_times, allowed_days, timezone, notification_settings, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .eq('reminders_enabled', true);
    if (preferenceError) throw new Error(`リマインダー設定を取得できません: ${preferenceError.message}`);

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from('push_subscriptions')
      .select('endpoint, user_id, student_id, subscription');
    if (subscriptionsError) throw new Error(`プッシュ通知登録を取得できません: ${subscriptionsError.message}`);

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const todosByStudent = new Map<string, TodoRow[]>();
    for (const todo of (todos || []) as TodoRow[]) {
      const list = todosByStudent.get(todo.student_id) || [];
      list.push(todo);
      todosByStudent.set(todo.student_id, list);
    }
    const subscriptionsByUser = new Map<string, SubscriptionRow[]>();
    for (const sub of (subscriptions || []) as SubscriptionRow[]) {
      const list = subscriptionsByUser.get(sub.user_id) || [];
      list.push(sub);
      subscriptionsByUser.set(sub.user_id, list);
    }

    let attempted = 0;
    let sent = 0;
    let skippedAlreadySent = 0;
    for (const pref of (preferences || []) as PreferenceRow[]) {
      const userSubscriptions = subscriptionsByUser.get(pref.user_id) || [];
      if (!userSubscriptions.length) continue;
      const userTodos = todosByStudent.get(pref.student_id) || [];
      const timezone = pref.timezone || 'Asia/Tokyo';
      const allowedDays = Array.isArray(pref.allowed_days) ? pref.allowed_days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const selectedRules = Array.isArray(pref.reminder_times) ? pref.reminder_times : [];
      const notificationSettings = pref.notification_settings && typeof pref.notification_settings === 'object'
        ? pref.notification_settings
        : {};
      // An explicit category OFF suppresses todo push reminders without disabling other categories.
      if (notificationSettings.todo_reminders === false) continue;
      // Quiet-hours currently suppress scheduled reminders during the configured window.
      // Fixed-time reminders skipped here are not queued for later delivery.
      if (isWithinQuietHours(now, timezone, pref.quiet_hours_enabled, pref.quiet_hours_start, pref.quiet_hours_end)) continue;

      for (const todo of userTodos) {
        for (const rule of RULES) {
          if (!selectedRules.includes(rule)) continue;
          if (!isReminderDue(rule, todo.due_at, now, timezone, allowedDays)) continue;

          const reminderKey = `${todo.id}|${rule}|${new Date(todo.due_at).getTime()}|${pref.user_id}`;
          const { data: previous, error: previousError } = await admin
            .from('push_reminder_deliveries')
            .select('reminder_key')
            .eq('reminder_key', reminderKey)
            .maybeSingle();
          if (previousError) throw new Error(`送信済み履歴を確認できません: ${previousError.message}`);
          if (previous) {
            skippedAlreadySent += 1;
            continue;
          }

          const label: Record<ReminderRule, string> = {
            twoDaysBefore: '提出期限の2日前',
            dayBefore: '提出期限は明日',
            morningOf: '提出期限は今日',
            threeHoursBefore: '提出期限まであと3時間',
          };
          const payload = JSON.stringify({
            title: `CampusSync｜${label[rule]}`,
            body: `${todo.title} の提出を確認しましょう。`,
            url: '/',
            tag: `todo-${todo.id}-${rule}`,
          });
          attempted += userSubscriptions.length;
          const sendResults = await Promise.allSettled(userSubscriptions.map((sub) =>
            webpush.sendNotification(sub.subscription, payload, { TTL: 60 * 60, urgency: 'high' })
          ));
          let delivered = 0;
          for (let i = 0; i < sendResults.length; i += 1) {
            const result = sendResults[i];
            if (result.status === 'fulfilled') {
              delivered += 1;
            } else {
              const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                await admin.from('push_subscriptions').delete().eq('endpoint', userSubscriptions[i].endpoint);
              } else {
                console.error('CampusSync reminder push failed:', result.reason);
              }
            }
          }
          if (delivered > 0) {
            const { error: insertError } = await admin.from('push_reminder_deliveries').insert({
              reminder_key: reminderKey,
              user_id: pref.user_id,
              student_id: pref.student_id,
              todo_id: String(todo.id),
              reminder_type: rule,
              due_at: todo.due_at,
              sent_at: now.toISOString(),
            });
            if (insertError && insertError.code !== '23505') throw new Error(`送信済み履歴を保存できません: ${insertError.message}`);
            sent += delivered;
          }
        }
      }
    }

    return NextResponse.json({ success: true, checked: (todos || []).length, attempted, sent, skippedAlreadySent, checkedAt: now.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('CampusSync scheduled reminders failed:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
