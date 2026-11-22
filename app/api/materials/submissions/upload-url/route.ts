import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  ensureStudyMaterialsBucket,
  STUDY_MATERIAL_BUCKET,
  STUDY_MATERIAL_MAX_BYTES,
  STUDY_MATERIAL_MIME_TYPES,
  getStudyStudentContext,
} from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正なアップロード要求です。', 403);
  const context = await getStudyStudentContext(request);
  if (!context) return fail('学校アカウントでログインしてください。', 401);
  if (!context.verifiedClass) return fail('所属クラスが確認されてから資料を投稿できます。', 403);

  const body = await request.json().catch(() => null) as {
    fileName?: unknown; mimeType?: unknown; size?: unknown;
  } | null;
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const size = Number(body?.size);
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
  if (!STUDY_MATERIAL_MIME_TYPES.includes(mimeType as typeof STUDY_MATERIAL_MIME_TYPES[number])) {
    return fail('PDF・PNG・JPG形式のファイルを選んでください。');
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > STUDY_MATERIAL_MAX_BYTES) {
    return fail('ファイルは1件20MB以下にしてください。');
  }
  if (!fileName || fileName.length > 240) return fail('ファイル名を確認してください。');

  try {
    const admin = await ensureStudyMaterialsBucket();
    const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
    const path = 'submissions/' + randomUUID() + '.' + extension;
    const { data, error } = await admin.storage.from(STUDY_MATERIAL_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('Student material signed upload URL creation failed:', error?.message);
      return fail('投稿用アップロードURLを作成できませんでした。', 500);
    }
    return NextResponse.json({ success: true, path, token: data.token }, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    console.error('Student material upload bucket initialization failed:', error);
    return fail('資料用ストレージを準備できませんでした。', 500);
  }
}
