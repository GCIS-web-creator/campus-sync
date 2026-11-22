import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient, STUDY_MATERIAL_BUCKET } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ success: false, message: '投稿IDが正しくありません。' }, { status: 400 });
  }
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });
  const { data: submission, error } = await admin.from('study_material_submissions')
    .select('storage_path,file_name,status')
    .eq('id', id)
    .maybeSingle();
  if (error || !submission || !['pending', 'reviewing'].includes(submission.status)) {
    return NextResponse.json({ success: false, message: '確認待ちの投稿が見つかりません。' }, { status: 404 });
  }
  const { data, error: signedError } = await admin.storage.from(STUDY_MATERIAL_BUCKET)
    .createSignedUrl(submission.storage_path, 300, { download: false });
  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ success: false, message: 'プレビューURLを作成できませんでした。' }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    url: data.signedUrl,
    file_name: submission.file_name,
  }, { headers: { 'Cache-Control': 'no-store, private' } });
}
