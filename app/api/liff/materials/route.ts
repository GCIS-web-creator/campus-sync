import { NextResponse } from 'next/server';
import { canLineLiffViewerReadMaterial, getLineLiffMaterialsAccess } from '@/lib/line-liff-materials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const access = await getLineLiffMaterialsAccess(request);
    if (!access.ok) {
      const status = access.reason === 'unauthorized' ? 401 : 503;
      return NextResponse.json(
        { success: false, message: status === 401 ? 'LINEで認証してください。' : '資料サービスに接続できません。' },
        { status, headers: { 'Cache-Control': 'no-store, private' } },
      );
    }

    const [{ data: rows, error }, { data: allFolders, error: folderError }] = await Promise.all([
      access.admin.from('study_materials')
        .select('id,title,description,subject,material_type,target_scope,target_value,file_name,mime_type,file_size,folder_id,published_at,created_at')
        .eq('is_published', true)
        .is('archived_at', null)
        .order('published_at', { ascending: false })
        .limit(500),
      access.admin.from('study_material_folders')
        .select('id,name,parent_id,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);

    if (error || folderError) {
      console.error('LIFF study material list failed:', error?.message || folderError?.message);
      return NextResponse.json({ success: false, message: '資料・フォルダーを取得できませんでした。' }, { status: 500 });
    }

    const materials = (rows || []).filter(material =>
      canLineLiffViewerReadMaterial(material, access.verifiedClass),
    );
    const folderMap = new Map((allFolders || []).map(folder => [folder.id, folder]));
    const visibleFolderIds = new Set<string>();

    for (const material of materials) {
      let currentId = material.folder_id as string | null;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        visibleFolderIds.add(currentId);
        currentId = folderMap.get(currentId)?.parent_id || null;
      }
    }

    const folders = (allFolders || []).filter(folder => visibleFolderIds.has(folder.id));
    return NextResponse.json({
      success: true,
      materials,
      folders,
      linked: access.linked,
      verifiedClass: access.verifiedClass,
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('LIFF study materials request failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ success: false, message: '資料一覧を取得できませんでした。' }, { status: 500 });
  }
}
