import { NextResponse } from 'next/server';
import { getStudyStudentContext, canStudentViewMaterial } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });

    const [
      { data, error },
      { data: allFolders, error: folderError },
      { data: submissions, error: submissionsError },
    ] = await Promise.all([
      context.admin.from('study_materials')
        .select('id,title,description,subject,material_type,target_scope,target_value,file_name,mime_type,file_size,folder_id,published_at,created_at')
        .eq('is_published', true)
        .is('archived_at', null)
        .order('published_at', { ascending: false })
        .limit(300),
      context.admin.from('study_material_folders')
        .select('id,name,parent_id,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      context.admin.from('study_material_submissions')
        .select('id,title,subject,material_type,file_name,mime_type,file_size,status,review_note,created_at,reviewed_at')
        .eq('user_id', context.authUserId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (error || folderError || submissionsError) {
      console.error('Student study material list failed:', error?.message || folderError?.message || submissionsError?.message);
      return NextResponse.json({ success: false, message: '資料・フォルダー・投稿履歴を取得できませんでした。' }, { status: 500 });
    }
    const materials = (data || []).filter(material =>
      material.target_scope === 'all'
      || (context.verifiedClass !== null && canStudentViewMaterial(material, context.verifiedClass)),
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
      submissions: submissions || [],
      verifiedClass: context.verifiedClass,
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Student study material request failed:', error);
    return NextResponse.json({ success: false, message: '資料一覧を取得できませんでした。' }, { status: 500 });
  }
}
