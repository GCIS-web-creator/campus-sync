import { canStudentViewMaterial, getStudyMaterialsAdminClient } from '@/lib/study-materials-server';
import { getLineLiffSessionSubject } from '@/lib/line-liff-session';

const VERIFIED_CLASS_PATTERN = /^[1-3]-[1-8]$/;

export type LineLiffMaterialsAccess =
  | { ok: false; reason: 'unauthorized' | 'unavailable' }
  | {
      ok: true;
      admin: NonNullable<ReturnType<typeof getStudyMaterialsAdminClient>>;
      lineUserId: string;
      linked: boolean;
      verifiedClass: string | null;
    };

export async function getLineLiffMaterialsAccess(request: Request): Promise<LineLiffMaterialsAccess> {
  const lineUserId = getLineLiffSessionSubject(request);
  if (!lineUserId) return { ok: false, reason: 'unauthorized' };

  const admin = getStudyMaterialsAdminClient();
  if (!admin) return { ok: false, reason: 'unavailable' };

  const { data: link, error: linkError } = await admin
    .from('line_student_links')
    .select('student_id,auth_user_id')
    .eq('line_user_id', lineUserId)
    .not('linked_at', 'is', null)
    .maybeSingle();

  if (linkError) throw linkError;
  if (!link?.student_id || !link?.auth_user_id) {
    return { ok: true, admin, lineUserId, linked: false, verifiedClass: null };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('verified_class')
    .eq('student_id', link.student_id)
    .eq('auth_user_id', link.auth_user_id)
    .maybeSingle();

  if (profileError) throw profileError;
  const candidate = typeof profile?.verified_class === 'string' ? profile.verified_class : '';
  const verifiedClass = VERIFIED_CLASS_PATTERN.test(candidate) ? candidate : null;

  return { ok: true, admin, lineUserId, linked: true, verifiedClass };
}

export function canLineLiffViewerReadMaterial(
  material: { target_scope: string; target_value: string | null },
  verifiedClass: string | null,
): boolean {
  return material.target_scope === 'all'
    || (verifiedClass !== null && canStudentViewMaterial(material, verifiedClass));
}
