import { NextResponse } from 'next/server';
import {
  getStudyStudentContext,
  STUDY_MATERIAL_BUCKET,
  STUDY_MATERIAL_MAX_BYTES,
  STUDY_MATERIAL_MIME_TYPES,
} from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUBJECTS = ['国語演習', '古典探求', '物理', '生物', '数３', '数C', '公共', '英コミュ', '論表', '情報', '保健', 'その他'];
const MATERIAL_TYPES = ['lesson', 'assignment', 'answer', 'explanation', 'past_exam', 'other'];

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
  if (!sameOrigin(request)) return fail('不正な投稿要求です。', 403);
  const context = await getStudyStudentContext(request);
  if (!context) return fail('学校アカウントでログインしてください。', 401);
  if (!context.verifiedClass) return fail('所属クラスが確認されてから資料を投稿できます。', 403);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return fail('投稿内容を読み取れません。');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const materialType = typeof body.material_type === 'string' ? body.material_type : '';
  const storagePath = typeof body.storage_path === 'string' ? body.storage_path : '';
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim() : '';
  const mimeType = typeof body.mime_type === 'string' ? body.mime_type : '';
  const fileSize = Number(body.file_size);

  if (!title || title.length > 160) return fail('資料名は1〜160文字で入力してください。');
  if (description.length > 2000) return fail('説明は2000文字以内にしてください。');
  if (!SUBJECTS.includes(subject)) return fail('教科を選択してください。');
  if (!MATERIAL_TYPES.includes(materialType)) return fail('資料の種類を選択してください。');
  if (!/^submissions\/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$/i.test(storagePath)) return fail('投稿ファイルの識別情報が正しくありません。');
  if (!fileName || fileName.length > 240) return fail('ファイル名を確認してください。');
  if (!STUDY_MATERIAL_MIME_TYPES.includes(mimeType as typeof STUDY_MATERIAL_MIME_TYPES[number])) return fail('ファイル形式が正しくありません。');
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > STUDY_MATERIAL_MAX_BYTES) return fail('ファイルサイズは20MB以下にしてください。');

  const { count, error: countError } = await context.admin.from('study_material_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', context.authUserId)
    .in('status', ['pending', 'reviewing']);
  if (countError) return fail('投稿数を確認できませんでした。', 500);
  if ((count || 0) >= 20) return fail('確認待ちの投稿が20件あります。管理者の確認後に追加してください。', 429);

  try {
    const { data: uploadInfo, error: infoError } = await context.admin.storage.from(STUDY_MATERIAL_BUCKET).info(storagePath);
    if (infoError || !uploadInfo) return fail('アップロードされたファイルを確認できません。再度選択してください。');
    if (Number(uploadInfo.size || 0) !== fileSize || String(uploadInfo.contentType || '') !== mimeType) {
      return fail('アップロードファイルの内容と申告情報が一致しません。');
    }

    const { data, error } = await context.admin.from('study_material_submissions').insert({
      user_id: context.authUserId,
      student_id: context.studentId,
      student_name: context.studentName,
      user_class: context.verifiedClass,
      title,
      description,
      subject,
      material_type: materialType,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      status: 'pending',
    }).select('id,title,status,created_at').single();
    if (error || !data) {
      console.error('Student material submission save failed:', error?.message);
      return fail('投稿情報を保存できませんでした。', 500);
    }
    return NextResponse.json({ success: true, submission: data }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (error) {
    console.error('Student material submission verification failed:', error);
    return fail('投稿ファイルを確認できませんでした。', 500);
  }
}
