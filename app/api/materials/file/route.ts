import { NextResponse } from 'next/server';
import { getStudyStudentContext, canStudentViewMaterial, STUDY_MATERIAL_BUCKET } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });

    const requestUrl = new URL(request.url);
    const id = requestUrl.searchParams.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ success: false, message: '資料IDが正しくありません。' }, { status: 400 });

    const { data: material, error } = await context.admin.from('study_materials')
      .select('storage_path,file_name,mime_type,target_scope,target_value')
      .eq('id', id)
      .eq('is_published', true)
      .is('archived_at', null)
      .maybeSingle();
    if (error || !material || !canStudentViewMaterial(material, context.userClass)) {
      return NextResponse.json({ success: false, message: 'この資料を閲覧する権限がありません。' }, { status: 404 });
    }

    const download = requestUrl.searchParams.get('download') === '1';
    const { data, error: signedError } = await context.admin.storage.from(STUDY_MATERIAL_BUCKET)
      .createSignedUrl(material.storage_path, 300, { download: download ? material.file_name : false });
    if (signedError || !data?.signedUrl) {
      return NextResponse.json({ success: false, message: 'ファイルURLを作成できませんでした。' }, { status: 500 });
    }
    return NextResponse.json({ success: true, url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Student study material file request failed:', error);
    return NextResponse.json({ success: false, message: 'ファイルを開けませんでした。' }, { status: 500 });
  }
}
