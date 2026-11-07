import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchSchoolWeatherForecast } from '@/lib/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  return Boolean(secret && request.headers.get('authorization') === 'Bearer ' + secret);
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

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return year + '年' + month + '月' + day + '日';
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: '許可されていないリクエストです。' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Supabaseサーバー設定が不足しています。' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const now = new Date();
  const dateKey = tokyoDateKey(now);
  const dateLabel = formatDateLabel(dateKey);
  const [menuResult, forecastResult] = await Promise.all([
    admin.from('cafeteria_daily_menus')
      .select('service_date,soka_lunch,healthy_lunch,snack_lunch,curry,noodles,is_closed,note')
      .eq('service_date', dateKey)
      .maybeSingle(),
    fetchSchoolWeatherForecast(1).catch(error => {
      console.error('Daily Push weather forecast failed:', error instanceof Error ? error.message : 'unknown');
      return null;
    }),
  ]);

  if (menuResult.error) {
    console.error('Daily Push menu lookup failed:', menuResult.error.message);
    return NextResponse.json({ success: false, message: '今日の献立データを取得できませんでした。' }, { status: 500 });
  }

  let menuResultSummary: Record<string, unknown> = { skipped: true, reason: '本日の献立行が未登録です。' };
  if (menuResult.data) {
    const menu = menuResult.data;
    let menuBody: string;
    if (menu.is_closed) {
      menuBody = dateLabel + 'は学食の営業がありません。';
      if (String(menu.note || '').trim()) menuBody += '\n' + String(menu.note).trim();
    } else {
      const entries: Array<[string, string | null]> = [
        ['創価ランチ', menu.soka_lunch],
        ['ヘルシーランチ', menu.healthy_lunch],
        ['スナックランチ', menu.snack_lunch],
        ['カレー', menu.curry],
        ['麺類', menu.noodles],
      ];
      const menuLines = entries.flatMap(([label, value]) => value && value.trim()
        ? ['・' + label + '：' + value.trim()]
        : []);
      menuBody = menuLines.length
        ? dateLabel + 'の献立\n' + menuLines.join('\n')
        : dateLabel + 'の献立はまだ登録されていません。';
      if (String(menu.note || '').trim()) menuBody += '\n備考：' + String(menu.note).trim();
    }
    const { data, error } = await admin.rpc('push_enqueue_broadcast', {
      p_event_key: 'daily-menu:' + dateKey,
      p_category: 'cafeteria_updates',
      p_title: '今日の学食メニュー',
      p_body: menuBody,
      p_url: '/#food',
      p_priority: 'normal',
    });
    if (error) {
      console.error('Daily menu Push queue failed:', error.message);
      menuResultSummary = { queued: false, error: error.message };
    } else {
      menuResultSummary = { queued: true, recipientsEvaluated: data };
    }
  }

  let weatherResultSummary: Record<string, unknown> = { queued: false, reason: '天気予報を取得できませんでした。' };
  if (forecastResult?.length) {
    const forecast = forecastResult.find(day => day.date === dateKey) || forecastResult[0];
    const weatherLines = [
      dateLabel + 'の天気（小平市周辺）',
      forecast.description,
      '最高気温：' + (forecast.highC === null ? 'データなし' : forecast.highC + '℃'),
      '最低気温：' + (forecast.lowC === null ? 'データなし' : forecast.lowC + '℃'),
      '降水確率：' + (forecast.precipitationProbabilityMax === null ? 'データなし' : forecast.precipitationProbabilityMax + '%'),
    ];
    const { data, error } = await admin.rpc('push_enqueue_broadcast', {
      p_event_key: 'daily-weather:' + dateKey,
      p_category: 'weather_alerts',
      p_title: '今日の天気',
      p_body: weatherLines.join('\n'),
      p_url: '/#weather',
      p_priority: 'normal',
    });
    if (error) {
      console.error('Daily weather Push queue failed:', error.message);
      weatherResultSummary = { queued: false, error: error.message };
    } else {
      weatherResultSummary = { queued: true, recipientsEvaluated: data };
    }
  }

  const menuQueued = menuResultSummary.queued === true;
  const weatherQueued = weatherResultSummary.queued === true;
  const success = menuQueued || weatherQueued || (menuResultSummary.skipped === true && weatherResultSummary.queued === false);
  return NextResponse.json({
    success,
    date: dateKey,
    menu: menuResultSummary,
    weather: weatherResultSummary,
    checkedAt: now.toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
