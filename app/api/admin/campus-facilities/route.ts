import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validate(request: Request) {
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !getAdmin()) {
    return NextResponse.json({ success: false, message: 'AdminまたはSupabaseのサーバー設定が不足しています。' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, message: 'Admin用パスワードが正しくありません。' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const { data, error } = await admin
    .from('campus_facilities')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('校内施設管理一覧の取得に失敗:', error.message);
    return NextResponse.json({ success: false, message: '校内施設一覧を取得できません。SQL設定を確認してください。' }, { status: 500 });
  }
  return NextResponse.json({ success: true, facilities: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ success: false, message: '入力内容を読み取れません。' }, { status: 400 });
  }

  const id = typeof payload.id === 'string' ? payload.id.trim() : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const category = typeof payload.category === 'string' ? payload.category.trim() : 'facility';
  const building = typeof payload.building === 'string' ? payload.building.trim() : '';
  const floorLabel = typeof payload.floor_label === 'string' ? payload.floor_label.trim() : '';
  const locationDescription = typeof payload.location_description === 'string' ? payload.location_description.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const mapImageUrl = typeof payload.map_image_url === 'string' ? payload.map_image_url.trim() : '';
  const rawX = payload.map_x;
  const rawY = payload.map_y;
  const mapX = rawX === null || rawX === '' || rawX === undefined ? null : Number(rawX);
  const mapY = rawY === null || rawY === '' || rawY === undefined ? null : Number(rawY);
  const keywords = Array.isArray(payload.keywords)
    ? payload.keywords.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 12)
    : [];

  const validCategories = new Set(['facility', 'hall', 'classroom', 'meeting', 'library', 'study', 'sports', 'office', 'other']);
  if (!name || name.length > 80 || !validCategories.has(category)) {
    return NextResponse.json({ success: false, message: '施設名またはカテゴリが正しくありません。' }, { status: 400 });
  }
  if ([building, floorLabel, locationDescription, description].some(value => value.length > 300)) {
    return NextResponse.json({ success: false, message: '建物・階・場所・説明は各300文字以内にしてください。' }, { status: 400 });
  }
  if ((mapX === null) !== (mapY === null) || (mapX !== null && (!Number.isFinite(mapX) || mapX < 0 || mapX > 100)) || (mapY !== null && (!Number.isFinite(mapY) || mapY < 0 || mapY > 100))) {
    return NextResponse.json({ success: false, message: 'マップ座標はX・Yを両方0〜100で入力してください。' }, { status: 400 });
  }
  if (mapImageUrl) {
    try {
      if (new URL(mapImageUrl).protocol !== 'https:') throw new Error('invalid');
    } catch {
      return NextResponse.json({ success: false, message: 'マップ画像URLはHTTPSの公開URLを指定してください。' }, { status: 400 });
    }
  }

  const values = {
    name, category, building, floor_label: floorLabel,
    location_description: locationDescription, description,
    keywords, map_image_url: mapImageUrl || null,
    map_x: mapX, map_y: mapY, is_active: true,
    updated_at: new Date().toISOString(),
  };

  const query = id
    ? admin.from('campus_facilities').update(values).eq('id', id)
    : admin.from('campus_facilities').insert(values);
  const { data, error } = await query.select('*').single();

  if (error || !data) {
    console.error('校内施設の保存に失敗:', error?.message);
    return NextResponse.json({ success: false, message: '校内施設を保存できませんでした。' }, { status: 500 });
  }
  return NextResponse.json({ success: true, facility: data, message: '校内施設を保存しました。' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  const denied = validate(request);
  if (denied) return denied;
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ success: false, message: '施設IDが正しくありません。' }, { status: 400 });
  }

  const { error } = await admin.from('campus_facilities')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('校内施設の非公開処理に失敗:', error.message);
    return NextResponse.json({ success: false, message: '施設を非公開にできませんでした。' }, { status: 500 });
  }
  return NextResponse.json({ success: true, message: '施設を非公開にしました。' }, { headers: { 'Cache-Control': 'no-store' } });
}
