import { PDFDocument } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { canStudentViewMaterial, getStudyStudentContext, STUDY_MATERIAL_BUCKET } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILES = 15;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_PAGES = 1200;
const noStore = { 'Cache-Control': 'no-store, private' };

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: noStore });
}

export async function POST(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return fail('学校アカウントでログインしてください。', 401);

    const body = await request.json().catch(() => null) as { ids?: unknown } | null;
    if (!Array.isArray(body?.ids) || body.ids.length < 2 || body.ids.length > MAX_FILES) {
      return fail('結合するPDFを2〜15件選択してください。');
    }
    const ids = body.ids;
    if (ids.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) {
      return fail('資料の指定が正しくありません。');
    }
    const uniqueIds = [...new Set(ids as string[])];
    if (uniqueIds.length !== ids.length) return fail('同じPDFが重複して選択されています。');

    const { data: materials, error } = await context.admin.from('study_materials')
      .select('id,title,file_name,mime_type,file_size,storage_path,target_scope,target_value')
      .in('id', uniqueIds)
      .eq('is_published', true)
      .is('archived_at', null);
    if (error) {
      console.error('Study material merge lookup failed:', error.message);
      return fail('結合する資料を取得できませんでした。', 500);
    }
    if (!materials || materials.length !== uniqueIds.length) {
      return fail('選択した資料の一部が公開終了、または閲覧できなくなっています。資料一覧を更新してください。', 403);
    }

    const byId = new Map<string, (typeof materials)[number]>(materials.map(item => [item.id, item]));
    const ordered = uniqueIds.map(id => byId.get(id)!);
    for (const item of ordered) {
      if (item.mime_type !== 'application/pdf') return fail('PDF以外の資料が選択されています。');
      if (!(item.target_scope === 'all' || (context.verifiedClass !== null && canStudentViewMaterial(item, context.verifiedClass)))) {
        return fail('選択した資料の閲覧権限がありません。', 403);
      }
    }

    const expectedTotal = ordered.reduce((sum, item) => sum + Number(item.file_size || 0), 0);
    if (ordered.some(item => !Number.isSafeInteger(Number(item.file_size)) || Number(item.file_size) < 1 || Number(item.file_size) > 20 * 1024 * 1024)
      || expectedTotal > MAX_TOTAL_BYTES) {
      return fail('PDFの合計サイズが大きすぎます。50MB以内になるように選択してください。', 413);
    }

    const merged = await PDFDocument.create();
    let totalPages = 0;
    for (const item of ordered) {
      const { data: file, error: downloadError } = await context.admin.storage.from(STUDY_MATERIAL_BUCKET).download(item.storage_path);
      if (downloadError || !file) {
        console.error('Study material PDF download failed:', downloadError?.message);
        return fail('「' + item.title + '」を読み込めませんでした。', 500);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
        return fail('「' + item.title + '」は有効なPDFではありません。', 422);
      }
      let source: PDFDocument;
      try {
        source = await PDFDocument.load(bytes);
      } catch {
        return fail('「' + item.title + '」をPDFとして読み取れませんでした。パスワード保護などを確認してください。', 422);
      }
      const pageCount = source.getPageCount();
      if (pageCount < 1) return fail('「' + item.title + '」にページがありません。', 422);
      totalPages += pageCount;
      if (totalPages > MAX_TOTAL_PAGES) {
        return fail('結合後のページ数が上限（1,200ページ）を超えています。', 413);
      }
      const copiedPages = await merged.copyPages(source, source.getPageIndices());
      for (const page of copiedPages) merged.addPage(page);
    }

    merged.setTitle('CampusSync プリント資料まとめ');
    merged.setProducer('CampusSync');
    const output = Buffer.from(await merged.save({ useObjectStreams: true }));
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = 'CampusSync_プリント資料まとめ_' + date + '.pdf';
    return new Response(output, {
      status: 200,
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Length': String(output.byteLength),
        'Content-Disposition': "attachment; filename=\"campussync-merged.pdf\"; filename*=UTF-8''" + encodeURIComponent(fileName),
      },
    });
  } catch (error) {
    console.error('Student study material PDF merge failed:', error);
    return fail('PDFの結合に失敗しました。壊れたPDFや特殊な保護設定がないか確認してください。', 500);
  }
}
