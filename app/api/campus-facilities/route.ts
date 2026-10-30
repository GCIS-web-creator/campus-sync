import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!url || !key || !token) {
    return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  const email = String(auth.user?.email || '').toLowerCase();
  if (authError || !auth.user || !/^[0-9]{6}@tokyo\.soka\.ed\.jp$/.test(email)) {
    return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });
  }

  const { data, error } = await client
    .from('campus_facilities')
    .select('id, name, category, building, floor_label, location_description, description, keywords, map_image_url, map_x, map_y')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('校内施設一覧を取得できません:', error.message);
    return NextResponse.json({
      success: false,
      message: '校内施設情報を読み込めません。supabase/campus-platform-features.sql を実行してください。',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ success: true, facilities: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
