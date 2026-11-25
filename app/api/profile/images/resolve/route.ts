import { NextResponse } from 'next/server';
import { getStudyStudentContext } from '@/lib/study-materials-server';
import { ensureProfileImagesBucket, PROFILE_IMAGE_BUCKET, isProfileImagePath } from '@/lib/profile-images-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImageRequest = { userId?: unknown; kind?: unknown; path?: unknown };
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な画像参照要求です。', 403);
  const context = await getStudyStudentContext(request);
  if (!context) return fail('学校アカウントでログインしてください。', 401);
  const body = await request.json().catch(() => null) as { items?: ImageRequest[] } | null;
  const items = Array.isArray(body?.items) ? body.items.slice(0, 120) : [];
  if (!items.length || body?.items?.length > 120) return fail('画像情報を確認してください。');

  try {
    await ensureProfileImagesBucket(context.admin);
    const otherIds = [...new Set(items.map(item => typeof item.userId === 'string' && item.userId !== context.authUserId ? item.userId : '').filter(Boolean))];
    if (otherIds.some(id => !UUID.test(id))) return fail('プロフィールIDが正しくありません。');
    const publicRows = new Map<string, any>();
    if (otherIds.length) {
      const { data, error } = await context.admin
        .from('student_profile_customizations')
        .select('user_id,is_public,avatar_path,banner_path')
        .in('user_id', otherIds)
        .eq('is_public', true);
      if (error) {
        console.error('Public profile image lookup failed:', error.message);
        return fail('公開画像を確認できませんでした。', 500);
      }
      for (const row of data || []) publicRows.set(String(row.user_id), row);
    }

    const resolved = await Promise.all(items.map(async item => {
      const userId = typeof item.userId === 'string' ? item.userId : '';
      const kind = item.kind === 'avatar' || item.kind === 'banner' ? item.kind : null;
      const path = typeof item.path === 'string' ? item.path : '';
      if (!kind || !UUID.test(userId) || !isProfileImagePath(path, userId, kind)) return { userId, kind, url: null };
      let authorized = userId === context.authUserId;
      if (!authorized) {
        const row = publicRows.get(userId);
        authorized = Boolean(row?.is_public && (kind === 'avatar' ? row.avatar_path : row.banner_path) === path);
      }
      if (!authorized) return { userId, kind, url: null };
      const { data, error } = await context.admin.storage.from(PROFILE_IMAGE_BUCKET).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) return { userId, kind, url: null };
      return { userId, kind, url: data.signedUrl };
    }));
    return NextResponse.json({ success: true, items: resolved }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Profile image URL resolution failed:', error);
    return fail('プロフィール画像を読み込めませんでした。', 500);
  }
}
