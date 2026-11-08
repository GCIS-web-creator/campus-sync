import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient, STUDY_MATERIAL_BUCKET } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) {
    return NextResponse.json({ success: false, message: '管理者ログインが必要です。' }, { status: 401 });
  }
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return NextResponse.json({ success: false, message: 'Supabaseの設定が不足しています。' }, { status: 503 });

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, message: '資料IDが正しくありません。' }, { status: 400 });
  const { data: material, error } = await admin.from('study_materials')
    .select('storage_path,file_name').eq('id', id).is('archived_at', null).maybeSingle();
  if (error || !material) return NextResponse.json({ success: false, message: '資料が見つかりません。' }, { status: error ? 500 : 404 });

  const download = new URL(request.url).searchParams.get('download') === '1';
  const { data, error: signedError } = await admin.storage.from(STUDY_MATERIAL_BUCKET)
    .createSignedUrl(material.storage_path, 300, { download: download ? material.file_name : false });
  if (signedError || !data?.signedUrl) return NextResponse.json({ success: false, message: 'ファイルURLを作成できませんでした。' }, { status: 500 });
  return NextResponse.json({ success: true, url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store, private' } });
}
