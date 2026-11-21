import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseStudyTimerPushRequest } from '@/lib/study-timer-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCHOOL_EMAIL = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, max-age=0' },
});

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!accessToken) return json({ success: false, message: '学校メールでログインしてください。' }, 401);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return json({ success: false, message: '通知サーバーの設定が不足しています。' }, 503);
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: 'Bearer ' + accessToken } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
    const user = authData.user;
    if (authError || !user?.id || !SCHOOL_EMAIL.test(String(user.email || ''))) {
      return json({ success: false, message: 'ログインの有効期限が切れているか、学校アカウントではありません。' }, 401);
    }

    const requestBody = await request.json().catch(() => null);
    let parsed;
    try {
      parsed = parseStudyTimerPushRequest(requestBody);
    } catch (error) {
      return json({ success: false, message: error instanceof Error ? error.message : 'リクエスト内容が正しくありません。' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    if (parsed.action === 'cancel') {
      const { data, error } = await admin.rpc('campussync_cancel_study_timer_notifications', {
        p_schedule_id: parsed.scheduleId, p_user_id: user.id,
      });
      if (error) throw error;
      return json({ success: true, cancelled_count: Number(data || 0) });
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from('push_subscriptions').select('endpoint').eq('user_id', user.id).limit(1).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription) {
      return json({ success: false, message: 'この端末の通知がまだ有効ではありません。プロフィールの「この端末の通知を有効化」を先に設定してください。' }, 409);
    }

    const { data: preference, error: preferenceError } = await admin
      .from('push_reminder_preferences').select('notification_settings').eq('user_id', user.id).maybeSingle();
    if (preferenceError) throw preferenceError;
    if (preference?.notification_settings?.todo_reminders === false) {
      return json({ success: false, message: '通知設定で提出期限リマインダーがOFFです。プロフィールの通知設定を確認してください。' }, 409);
    }

    const studentId = String(user.email).split('@')[0];
    const { data: scheduledCount, error: scheduleError } = await admin.rpc('campussync_schedule_study_timer_notifications', {
      p_schedule_id: parsed.scheduleId,
      p_user_id: user.id,
      p_student_id: studentId,
      p_phase: parsed.phase,
      p_remaining_seconds: parsed.remainingSeconds,
      p_break_seconds: parsed.breakSeconds,
    });
    if (scheduleError) throw scheduleError;
    const queued = Number(scheduledCount || 0);
    if (queued < 1) return json({ success: false, message: 'タイマー通知を予約できませんでした。通知登録と通知設定を確認してください。' }, 409);
    return json({ success: true, scheduled_count: queued });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('Study timer Push endpoint failed:', message);
    return json({ success: false, message: 'タイマー通知の予約を処理できませんでした。' }, 500);
  }
}
