import { NextResponse } from 'next/server';
import { STUDY_MATERIAL_BUCKET, STUDY_MATERIAL_MIME_TYPES } from '@/lib/study-materials-server';
import { canLineLiffViewerReadMaterial, getLineLiffMaterialsAccess } from '@/lib/line-liff-materials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const access = await getLineLiffMaterialsAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, message: access.reason === 'unauthorized' ? 'LINEで認証してください。' : '資料サービスに接続できません。' },
        { status: access.reason === 'unauthorized' ? 401 : 503, headers: { 'Cache-Control': 'no-store, private' } },
      );
    }

    const requestUrl = new URL(request.url);
    const id = requestUrl.searchParams.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ success: false, message: '資料IDが正しくありません。' }, { status: 400 });
    }

    const { data: material, error } = await access.admin.from('study_materials')
      .select('storage_path,file_name,mime_type,target_scope,target_value')
      .eq('id', id)
      .eq('is_published', true)
      .is('archived_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!material || !canLineLiffViewerReadMaterial(material, access.verifiedClass)) {
      return NextResponse.json({ success: false, message: 'この資料を閲覧する権限がありません。' }, { status: 404 });
    }

    if (!(STUDY_MATERIAL_MIME_TYPES as readonly string[]).includes(material.mime_type)) {
      return NextResponse.json({ success: false, message: 'このファイル形式には対応していません。' }, { status: 415 });
    }

    const download = requestUrl.searchParams.get('download') === '1';

    // LINE内ブラウザはiframe内のPDF表示に対応しない場合があるため、
    // プレビュー用PDFは認証済みの同一オリジンAPIからバイナリで返す。
    if (!download && material.mime_type === 'application/pdf') {
      const { data: fileData, error: downloadError } = await access.admin.storage
        .from(STUDY_MATERIAL_BUCKET)
        .download(material.storage_path);

      if (downloadError || !fileData) {
        console.error('LIFF PDF download failed:', downloadError?.message || 'empty file');
        return NextResponse.json({ success: false, message: 'PDFファイルを取得できませんでした。' }, { status: 500 });
      }

      return new NextResponse(fileData, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(fileData.size),
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-store, private',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const { data, error: signedError } = await access.admin.storage.from(STUDY_MATERIAL_BUCKET)
      .createSignedUrl(material.storage_path, 300, { download: download ? material.file_name : false });

    if (signedError || !data?.signedUrl) {
      return NextResponse.json({ success: false, message: 'ファイルURLを作成できませんでした。' }, { status: 500 });
    }

    return NextResponse.redirect(data.signedUrl, {
      headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' },
    });
  } catch (error) {
    console.error('LIFF study material file request failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: 'ファイルを開けませんでした。' }, { status: 500 });
  }
}
