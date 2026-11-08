import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import {
  ensureStudyMaterialsBucket,
  STUDY_MATERIAL_BUCKET,
  STUDY_MATERIAL_MAX_BYTES,
  STUDY_MATERIAL_MIME_TYPES,
} from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function fail(message: string, status: number) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正なアップロード要求です。', 403);
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);

  const body = await request.json().catch(() => null) as {
    fileName?: unknown;
    mimeType?: unknown;
    size?: unknown;
  } | null;

  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const size = Number(body?.size);
  const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
  if (!STUDY_MATERIAL_MIME_TYPES.includes(mimeType as typeof STUDY_MATERIAL_MIME_TYPES[number])) {
    return fail('PDF・PNG・JPG形式のファイルを選んでください。', 400);
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > STUDY_MATERIAL_MAX_BYTES) {
    return fail('ファイルは20MB以下にしてください。', 400);
  }
  if (!fileName.trim() || fileName.length > 240) {
    return fail('ファイル名を確認してください。', 400);
  }

  const extension = mimeType === 'application/pdf'
    ? 'pdf'
    : mimeType === 'image/png' ? 'png' : 'jpg';
  try {
    const admin = await ensureStudyMaterialsBucket();
    const path = 'uploads/' + randomUUID() + '.' + extension;
    const { data, error } = await admin.storage.from(STUDY_MATERIAL_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error('Study material signed upload URL creation failed:', error?.message);
      return fail('アップロード用URLを作成できませんでした。', 500);
    }
    return NextResponse.json({ success: true, path, token: data.token }, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    console.error('Study material bucket initialization failed:', error);
    return fail('資料用ストレージを準備できませんでした。Supabaseの設定を確認してください。', 500);
  }
}
