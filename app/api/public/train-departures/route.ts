import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { success: false, message: '発車時刻表のサーバー設定が不足しています。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await db
      .from('takanodai_timetable')
      .select('direction,departure_time,service,service_day')
      .order('departure_time', { ascending: true })
      .limit(600);

    if (error) {
      console.error('LIFF public train timetable query failed:', error.message);
      return NextResponse.json(
        { success: false, message: '発車時刻表を取得できませんでした。' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const rows = (data || []).filter(row =>
      (row.direction === 'kokubunji' || row.direction === 'higashimurayama')
      && /^\d{1,2}:\d{2}$/.test(String(row.departure_time || ''))
      && (row.service_day === 'weekday' || row.service_day === 'saturday'),
    );
    return NextResponse.json(
      { success: true, station: '鷹の台駅', rows },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (error) {
    console.error('LIFF public train timetable failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { success: false, message: '発車時刻表を取得できませんでした。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
