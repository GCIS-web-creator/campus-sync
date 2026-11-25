import { NextResponse } from 'next/server';
import { getStudyStudentContext } from '@/lib/study-materials-server';
import { ensureProfileImagesBucket, PROFILE_IMAGE_BUCKET, PROFILE_IMAGE_MAX_BYTES } from '@/lib/profile-images-server';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正なアップロード要求です。', 403);
  const context = await getStudyStudentContext(request);
  if (!context) return fail('学校アカウントでログインしてください。', 401);

  const body = await request.json().catch(() => null) as { kind?: unknown; mimeType?: unknown; size?: unknown } | null;
  const kind = body?.kind;
  const mimeType = body?.mimeType;
  const size = Number(body?.size);
  if (kind !== 'avatar' && kind !== 'banner') return fail('画像の種類を確認してください。');
  if (mimeType !== 'image/webp') return fail('画像はWebPに変換してからアップロードしてください。');
  if (!Number.isSafeInteger(size) || size < 1 || size > PROFILE_IMAGE_MAX_BYTES) return fail('変換後の画像は2MB以下にしてください。');

  try {
    await ensureProfileImagesBucket(context.admin);
    const path = context.authUserId + '/' + kind + '/' + randomUUID() + '.webp';
    const { data, error } = await context.admin.storage.from(PROFILE_IMAGE_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('Profile image upload URL creation failed:', error?.message);
      return fail('画像アップロード用URLを作成できませんでした。', 500);
    }
    return NextResponse.json({ success: true, path, token: data.token }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Profile image bucket setup failed:', error);
    return fail('プロフィール画像用ストレージを準備できませんでした。', 500);
  }
}
