import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import {
  ensureStudyMaterialsBucket,
  getStudyMaterialsAdminClient,
  STUDY_MATERIAL_BUCKET,
  isValidMaterialStoragePath,
} from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const MATERIAL_TYPES = ['lesson', 'assignment', 'answer', 'explanation', 'past_exam', 'other'];
const noStore = { 'Cache-Control': 'no-store, private' };

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: noStore });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function authorized(request: Request): boolean {
  return verifyAdminSessionRequest(request);
}

function validateMetadata(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const materialType = typeof body.material_type === 'string' ? body.material_type : '';
  const targetScope = typeof body.target_scope === 'string' ? body.target_scope : '';
  const targetValue = typeof body.target_value === 'string' ? body.target_value : null;

  if (!title || title.length > 160) return { error: '資料名は1〜160文字で入力してください。' };
  if (description.length > 2000) return { error: '説明は2000文字以内にしてください。' };
  if (!SUBJECTS.includes(subject)) return { error: '教科を選択してください。' };
  if (!MATERIAL_TYPES.includes(materialType)) return { error: '資料の種類を選択してください。' };
  if (!['all', 'grade', 'class'].includes(targetScope)) return { error: '公開対象の指定が正しくありません。' };
  if (targetScope === 'all' && targetValue) return { error: '全校公開では対象クラスを指定できません。' };
  if (targetScope === 'grade' && !/^[1-3]$/.test(targetValue || '')) return { error: '公開する学年を選択してください。' };
  if (targetScope === 'class' && !/^[1-3]-[1-8]$/.test(targetValue || '')) return { error: '公開するクラスを選択してください。' };
  return { title, description, subject, materialType, targetScope, targetValue };
}

export async function GET(request: Request) {
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const { data, error } = await admin
    .from('study_materials')
    .select('id,title,description,subject,material_type,target_scope,target_value,file_name,mime_type,file_size,storage_path,is_published,published_at,created_at,updated_at')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('Study materials admin list failed:', error.message);
    return fail('資料一覧を取得できませんでした。', 500);
  }
  return NextResponse.json({ success: true, materials: data || [] }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail('資料情報を読み取れません。');
  const metadata = validateMetadata(body);
  if ('error' in metadata) return fail(metadata.error || '資料情報を確認してください。');
  const storagePath = body.storage_path;
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type : '';
  const fileSize = Number(body.file_size);
  if (!isValidMaterialStoragePath(storagePath)) return fail('アップロード済みファイルの識別情報が正しくありません。');
  if (!fileName || fileName.length > 240) return fail('元のファイル名を確認してください。');
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType)) return fail('ファイル形式が正しくありません。');
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > 20 * 1024 * 1024) return fail('ファイルサイズが正しくありません。');

  try {
    const { data: uploadInfo, error: infoError } = await admin.storage.from(STUDY_MATERIAL_BUCKET).info(storagePath);
    if (infoError || !uploadInfo) return fail('アップロードされたファイルを確認できません。再度アップロードしてください。', 400);
    const actualSize = Number(uploadInfo.size || 0);
    const actualMime = String(uploadInfo.contentType || '');
    if (actualSize !== fileSize || actualMime !== mimeType) return fail('アップロードファイルの内容と申告情報が一致しません。', 400);

    const isPublished = body.is_published === true;
    const record = {
      title: metadata.title,
      description: metadata.description,
      subject: metadata.subject,
      material_type: metadata.materialType,
      target_scope: metadata.targetScope,
      target_value: metadata.targetValue,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from('study_materials').insert(record).select('*').single();
    if (error) {
      console.error('Study material save failed:', error.message);
      return fail('資料情報を保存できませんでした。', 500);
    }
    return NextResponse.json({ success: true, material: data }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('Study material metadata verification failed:', error);
    return fail('アップロードファイルを確認できませんでした。', 500);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { id?: unknown; is_published?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body?.is_published !== 'boolean') return fail('変更内容が正しくありません。');

  const update = {
    is_published: body.is_published,
    published_at: body.is_published ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from('study_materials')
    .update(update).eq('id', id).is('archived_at', null)
    .select('id,is_published').maybeSingle();
  if (error || !data) return fail('資料の公開状態を変更できませんでした。', error ? 500 : 404);
  return NextResponse.json({ success: true, material: data }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!authorized(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseのサーバー設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('削除対象の資料IDが正しくありません。');

  const { data: material, error: lookupError } = await admin.from('study_materials')
    .select('id,storage_path').eq('id', id).maybeSingle();
  if (lookupError || !material) return fail('資料が見つかりません。', lookupError ? 500 : 404);

  const { error: storageError } = await admin.storage.from(STUDY_MATERIAL_BUCKET).remove([material.storage_path]);
  if (storageError) {
    console.error('Study material file deletion failed:', storageError.message);
    return fail('ファイルを削除できなかったため、資料情報も残しました。', 500);
  }
  const { error } = await admin.from('study_materials').delete().eq('id', id);
  if (error) {
    console.error('Study material row deletion failed:', error.message);
    return fail('ファイルは削除しましたが資料情報を削除できませんでした。', 500);
  }
  return NextResponse.json({ success: true }, { headers: noStore });
}
