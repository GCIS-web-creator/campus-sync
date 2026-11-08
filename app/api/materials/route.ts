import { NextResponse } from 'next/server';
import { getStudyStudentContext, canStudentViewMaterial } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return NextResponse.json({ success: false, message: '学校アカウントでログインしてください。' }, { status: 401 });

    const { data, error } = await context.admin.from('study_materials')
      .select('id,title,description,subject,material_type,target_scope,target_value,file_name,mime_type,file_size,published_at,created_at')
      .eq('is_published', true)
      .is('archived_at', null)
      .order('published_at', { ascending: false })
      .limit(300);

    if (error) {
      console.error('Student study material list failed:', error.message);
      return NextResponse.json({ success: false, message: '資料一覧を取得できませんでした。' }, { status: 500 });
    }
    const materials = (data || []).filter(material => canStudentViewMaterial(material, context.userClass));
    return NextResponse.json({ success: true, materials }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    console.error('Student study material request failed:', error);
    return NextResponse.json({ success: false, message: '資料一覧を取得できませんでした。' }, { status: 500 });
  }
}
