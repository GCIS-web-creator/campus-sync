import { createClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const expected = process.env.CAMPUS_SYNC_ADMIN_PASSWORD || '';
  const received = request.headers.get('x-admin-password') || '';
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.CAMPUS_SYNC_ADMIN_PASSWORD || !url || !serviceRoleKey) {
    return NextResponse.json({ message: 'CAMPUS_SYNC_ADMIN_PASSWORD / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定してください。' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ message: 'Admin用パスワードが正しくありません。' }, { status: 401 });

  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ message: '画像ファイルを読み取れませんでした。' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ message: 'アップロードする画像を選択してください。' }, { status: 400 });
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ message: '画像はJPGまたはPNG形式、5MB以下のものを選んでください。' }, { status: 400 });
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
  const { error } = await admin.storage.from('school-notification-images').upload(
    path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '3600', upsert: false },
  );
  if (error) {
    console.error('学園総合通知の画像アップロード失敗:', error.message);
    return NextResponse.json(
      { message: `画像を保存できませんでした。supabase/school-notifications.sqlを実行してください。詳細: ${error.message}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const imageUrl = admin.storage.from('school-notification-images').getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ success: true, imageUrl }, { headers: { 'Cache-Control': 'no-store' } });
}
