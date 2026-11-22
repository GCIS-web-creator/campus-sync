import { NextResponse } from 'next/server';
import { verifyAdminSessionRequest } from '@/lib/admin-auth';
import { getStudyMaterialsAdminClient, STUDY_MATERIAL_BUCKET } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, private' };
function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status, headers: noStore });
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export async function GET(request: Request) {
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseの設定が不足しています。', 503);
  const { data, error } = await admin.from('study_material_submissions')
    .select('id,user_id,student_id,student_name,user_class,title,description,subject,material_type,storage_path,file_name,mime_type,file_size,status,created_at')
    .in('status', ['pending', 'reviewing'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    console.error('Study material submissions admin list failed:', error.message);
    return fail('生徒からの投稿一覧を取得できませんでした。', 500);
  }

  const userIds = [...new Set((data || []).map(item => item.user_id))];
  const studentIds = [...new Set((data || []).map(item => item.student_id))];
  const profilesByUser = userIds.length
    ? await admin.from('profiles').select('auth_user_id,student_id,verified_class').in('auth_user_id', userIds)
    : { data: [], error: null };
  const profilesByStudent = studentIds.length
    ? await admin.from('profiles').select('auth_user_id,student_id,verified_class').in('student_id', studentIds)
    : { data: [], error: null };
  if (profilesByUser.error || profilesByStudent.error) return fail('投稿者の所属クラスを確認できませんでした。', 500);
  const verifiedByUser = new Map((profilesByUser.data || []).map(profile => [profile.auth_user_id, profile.verified_class]));
  const verifiedByStudent = new Map((profilesByStudent.data || []).map(profile => [profile.student_id, profile.verified_class]));
  const submissions = (data || []).map(item => {
    const candidate = verifiedByUser.get(item.user_id) ?? verifiedByStudent.get(item.student_id);
    return {
      ...item,
      verified_class: typeof candidate === 'string' && /^[1-3]-[1-8]$/.test(candidate) ? candidate : null,
    };
  });
  return NextResponse.json({ success: true, submissions }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('不正な管理操作です。', 403);
  if (!verifyAdminSessionRequest(request)) return fail('管理者ログインが必要です。', 401);
  const admin = getStudyMaterialsAdminClient();
  if (!admin) return fail('Supabaseの設定が不足しています。', 503);

  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown; review_note?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  const reviewNote = typeof body?.review_note === 'string' ? body.review_note.trim().slice(0, 1000) : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('対象の投稿IDが正しくありません。');
  if (action !== 'approve' && action !== 'reject') return fail('審査操作が正しくありません。');

  const { data: candidate, error: lookupError } = await admin.from('study_material_submissions')
    .select('*').eq('id', id).maybeSingle();
  if (lookupError || !candidate) return fail('投稿が見つかりません。', lookupError ? 500 : 404);
  if (candidate.status !== 'pending') return fail('この投稿は既に確認処理中、または処理済みです。', 409);

  const { data: claimed, error: claimError } = await admin.from('study_material_submissions')
    .update({ status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending')
    .select('*').maybeSingle();
  if (claimError || !claimed) return fail('別の管理者が先にこの投稿を処理した可能性があります。一覧を更新してください。', 409);

  if (action === 'reject') {
    const { error } = await admin.from('study_material_submissions').update({
      status: 'rejected',
      review_note: reviewNote || '内容を確認し、今回は資料室への掲載を見送りました。',
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'reviewing');
    if (error) return fail('差し戻し状態を保存できませんでした。', 500);
    // The rejected file remains in the private bucket and is never exposed to students.
    return NextResponse.json({ success: true, status: 'rejected' }, { headers: noStore });
  }

  try {
    const profileByUser = await admin.from('profiles')
      .select('verified_class')
      .eq('auth_user_id', claimed.user_id)
      .maybeSingle();
    const profileByStudent = !profileByUser.error && !profileByUser.data
      ? await admin.from('profiles').select('verified_class').eq('student_id', claimed.student_id).maybeSingle()
      : { data: null, error: null };
    const profile = profileByUser.data || profileByStudent.data;
    const verifiedClass = typeof profile?.verified_class === 'string' && /^[1-3]-[1-8]$/.test(profile.verified_class)
      ? profile.verified_class
      : null;
    if (profileByUser.error || profileByStudent.error || !verifiedClass) {
      await admin.from('study_material_submissions').update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'reviewing');
      return fail('投稿した生徒の所属クラスが未確認です。プロフィールのクラスを確認してから再度承認してください。', 409);
    }

    const { data: uploadInfo, error: infoError } = await admin.storage.from(STUDY_MATERIAL_BUCKET).info(claimed.storage_path);
    if (infoError || !uploadInfo
      || Number(uploadInfo.size || 0) !== Number(claimed.file_size)
      || String(uploadInfo.contentType || '') !== claimed.mime_type) {
      await admin.from('study_material_submissions').update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'reviewing');
      return fail('アップロードされたファイルを再確認できません。投稿者に再投稿を依頼してください。', 400);
    }

    const { data: root } = await admin.from('study_material_folders').select('id')
      .is('parent_id', null).eq('name', '学校資料').maybeSingle();
    const { data: subjectRoot } = root
      ? await admin.from('study_material_folders').select('id').eq('parent_id', root.id).eq('name', '教科別').maybeSingle()
      : { data: null };
    const { data: subjectFolder } = subjectRoot
      ? await admin.from('study_material_folders').select('id').eq('parent_id', subjectRoot.id).eq('name', claimed.subject).maybeSingle()
      : { data: null };

    const now = new Date().toISOString();
    const { data: material, error: insertError } = await admin.from('study_materials').insert({
      title: claimed.title,
      description: claimed.description || '',
      subject: claimed.subject,
      material_type: claimed.material_type,
      target_scope: 'class',
      target_value: verifiedClass,
      folder_id: subjectFolder?.id || root?.id || null,
      storage_path: claimed.storage_path,
      file_name: claimed.file_name,
      mime_type: claimed.mime_type,
      file_size: claimed.file_size,
      is_published: true,
      published_at: now,
      updated_at: now,
    }).select('id').single();

    if (insertError || !material) {
      console.error('Approve student material failed:', insertError?.message);
      await admin.from('study_material_submissions').update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'reviewing');
      return fail('資料室への登録に失敗しました。投稿は確認待ちに戻しました。', 500);
    }

    const { error: completeError } = await admin.from('study_material_submissions').update({
      status: 'approved',
      approved_material_id: material.id,
      review_note: reviewNote || null,
      reviewed_at: now,
      updated_at: now,
    }).eq('id', id).eq('status', 'reviewing');

    if (completeError) {
      await admin.from('study_materials').delete().eq('id', material.id);
      await admin.from('study_material_submissions').update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'reviewing');
      return fail('公開状態の保存に失敗したため、資料室への登録を取り消しました。', 500);
    }

    return NextResponse.json({
      success: true,
      status: 'approved',
      material_id: material.id,
      target_scope: 'class',
      target_value: verifiedClass,
    }, { headers: noStore });
  } catch (error) {
    console.error('Student material approval failed:', error);
    await admin.from('study_material_submissions').update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'reviewing');
    return fail('投稿の承認処理に失敗しました。', 500);
  }
}
