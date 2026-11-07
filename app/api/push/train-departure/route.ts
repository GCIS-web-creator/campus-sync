import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  return Boolean(secret && request.headers.get('authorization') === 'Bearer ' + secret);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  const now = new Date();
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(now);
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)) {
    return NextResponse.json({ success: true, skipped: true, reason: '平日以外は対象外です。' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Supabaseサーバー設定が不足しています。' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: departure, error: timetableError } = await admin.from('takanodai_timetable')
    .select('direction,departure_time,service,service_day')
    .eq('service_day', 'weekday')
    .eq('direction', 'kokubunji')
    .eq('departure_time', '16:04')
    .maybeSingle();
  if (timetableError) {
    console.error('16:04 Kokubunji departure lookup failed:', timetableError.message);
    return NextResponse.json({ success: false, message: '国分寺行きの時刻表を取得できませんでした。' }, { status: 500 });
  }
  if (!departure) {
    return NextResponse.json({ success: true, skipped: true, reason: '16:04発の国分寺行きが時刻表にありません。' });
  }

  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const { data, error } = await admin.rpc('push_enqueue_broadcast', {
    p_event_key: 'train-kokubunji-1604:' + dateKey,
    p_category: 'transport_alerts',
    p_title: '16:04発 国分寺行きまであと15分',
    p_body: '鷹の台駅 16:04発・' + String(departure.service || '各駅停車国分寺行き') + 'です。出発時刻を確認してください。',
    p_url: '/#bus',
    p_priority: 'high',
  });
  if (error) {
    console.error('16:04 Kokubunji Push queue failed:', error.message);
    return NextResponse.json({ success: false, message: '国分寺行き通知を配信キューに登録できませんでした。' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    queued: true,
    date: dateKey,
    recipientsEvaluated: data,
    departure: departure.departure_time,
    checkedAt: now.toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
