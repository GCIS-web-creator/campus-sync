import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getStudyStudentContext } from '@/lib/study-materials-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

async function getVerifiedClass(context: NonNullable<Awaited<ReturnType<typeof getStudyStudentContext>>>) {
  const { data, error } = await context.admin
    .from('profiles')
    .select('verified_class')
    .eq('student_id', context.studentId)
    .eq('auth_user_id', context.authUserId)
    .maybeSingle();
  if (error) throw error;
  const value = typeof data?.verified_class === 'string' ? data.verified_class : '';
  return /^[1-3]-[1-8]$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return response({ success: false, message: 'CampusSyncに学校アカウントでログインしてください。' }, 401);

    const [{ data: link, error }, verifiedClass] = await Promise.all([
      context.admin.from('line_student_links')
        .select('line_user_id,linked_at')
        .eq('auth_user_id', context.authUserId)
        .maybeSingle(),
      getVerifiedClass(context),
    ]);
    if (error) throw error;

    return response({
      success: true,
      linked: Boolean(link?.line_user_id && link?.linked_at),
      linkedAt: link?.linked_at || null,
      verifiedClass,
    });
  } catch (error) {
    console.error('LINE student link status failed:', error instanceof Error ? error.message : 'unknown');
    return response({ success: false, message: 'LINE連携状態を取得できませんでした。' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return response({ success: false, message: 'CampusSyncに学校アカウントでログインしてください。' }, 401);

    const { data: existing, error: lookupError } = await context.admin
      .from('line_student_links')
      .select('id,line_user_id,linked_at')
      .eq('auth_user_id', context.authUserId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing?.line_user_id && existing?.linked_at) {
      return response({ success: false, message: 'このCampusSyncアカウントはすでにLINE連携済みです。先に連携を解除してください。' }, 409);
    }

    const code = randomBytes(6).toString('hex').toUpperCase();
    const codeHash = createHash('sha256').update(code.toLowerCase(), 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const values = {
      auth_user_id: context.authUserId,
      student_id: context.studentId,
      line_user_id: null,
      code_hash: codeHash,
      code_expires_at: expiresAt,
      linked_at: null,
      updated_at: new Date().toISOString(),
    };

    const write = existing
      ? await context.admin.from('line_student_links').update({
          code_hash: values.code_hash,
          code_expires_at: values.code_expires_at,
          updated_at: values.updated_at,
        }).eq('id', existing.id).is('line_user_id', null).select('id').maybeSingle()
      : await context.admin.from('line_student_links').insert(values).select('id').maybeSingle();

    if (write.error) throw write.error;
    if (!write.data?.id) {
      return response({ success: false, message: 'LINE連携状態が更新されました。画面を更新してもう一度お試しください。' }, 409);
    }

    const verifiedClass = await getVerifiedClass(context);
    return response({
      success: true,
      code,
      expiresAt,
      verifiedClass,
      message: '認証コードを発行しました。5分以内にLINEの1対1トークへ送信してください。',
    });
  } catch (error) {
    console.error('LINE student link code creation failed:', error instanceof Error ? error.message : 'unknown');
    return response({ success: false, message: 'LINE連携コードを発行できませんでした。' }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getStudyStudentContext(request);
    if (!context) return response({ success: false, message: 'CampusSyncに学校アカウントでログインしてください。' }, 401);

    const { error } = await context.admin.from('line_student_links').update({
      line_user_id: null,
      code_hash: null,
      code_expires_at: null,
      linked_at: null,
      updated_at: new Date().toISOString(),
    }).eq('auth_user_id', context.authUserId);
    if (error) throw error;
    return response({ success: true, message: 'LINE連携を解除しました。' });
  } catch (error) {
    console.error('LINE student link removal failed:', error instanceof Error ? error.message : 'unknown');
    return response({ success: false, message: 'LINE連携を解除できませんでした。' }, 500);
  }
}
