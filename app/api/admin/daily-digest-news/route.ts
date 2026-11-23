import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'campussync_daily_digest_news';
const CATEGORIES = new Set(['news', 'notice', 'event', 'other']);

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) : null;
}

function getTokyoDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return String(values.year) + '-' + String(values.month) + '-' + String(values.day);
}

function validDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validatePayload(body: any) {
  const targetDate = typeof body?.targetDate === 'string' ? body.targetDate : '';
  const category = typeof body?.category === 'string' ? body.category : 'news';
  const icon = typeof body?.icon === 'string' ? body.icon.trim() : '📰';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.body === 'string' ? body.body.trim() : '';
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!validDateKey(targetDate)) return { error: '配信予定日を正しく指定してください。' };
  if (!CATEGORIES.has(category)) return { error: 'ニュースの種類が正しくありません。' };
  if (!title || title.length > 120) return { error: 'タイトルは1〜120文字で入力してください。' };
  if (icon.length < 1 || icon.length > 12) return { error: 'アイコンは1〜12文字で指定してください。' };
  if (description.length > 800) return { error: '説明は800文字以内で入力してください。' };
  if (url && (!url.startsWith('https://') || url.length > 1000)) return { error: 'リンクはhttps://から始まるURLを1000文字以内で入力してください。' };
  return {
    value: {
      target_date: targetDate,
      category,
      icon,
      title,
      body: description,
      url: url || null,
      is_active: body?.isActive !== false,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseのサーバー設定がありません。', 503);
  const url = new URL(request.url);
  const from = url.searchParams.get('from') || getTokyoDateKey();
  if (!validDateKey(from)) return fail('取得開始日が正しくありません。', 400);
  const { data, error } = await admin.from(TABLE)
    .select('id,target_date,category,icon,title,body,url,is_active,created_at,updated_at')
    .gte('target_date', from)
    .order('target_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    console.error('定期配信ニュースの取得に失敗:', error.message);
    return fail('定期配信ニュースを取得できませんでした。', 500);
  }
  return NextResponse.json({ success: true, items: data || [] }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseのサーバー設定がありません。', 503);
  const body = await request.json().catch(() => null);
  const validated = validatePayload(body);
  if ('error' in validated) return fail(validated.error, 400);
  const query = body?.id
    ? admin.from(TABLE).update(validated.value).eq('id', String(body.id))
    : admin.from(TABLE).insert(validated.value);
  const { data, error } = await query.select('id,target_date,category,icon,title,body,url,is_active,created_at,updated_at').single();
  if (error || !data) {
    console.error('定期配信ニュースの保存に失敗:', error?.message || 'no row returned');
    return fail('定期配信ニュースを保存できませんでした。', 500);
  }
  return NextResponse.json({ success: true, item: data }, { headers: { 'Cache-Control': 'no-store, private' } });
}

export async function DELETE(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('Adminログインが必要です。', 401);
  const admin = getAdmin();
  if (!admin) return fail('Supabaseのサーバー設定がありません。', 503);
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return fail('削除対象のIDがありません。', 400);
  const { error } = await admin.from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('定期配信ニュースの削除に失敗:', error.message);
    return fail('定期配信ニュースを削除できませんでした。', 500);
  }
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store, private' } });
}
