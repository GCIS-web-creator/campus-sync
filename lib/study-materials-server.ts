import { createClient } from '@supabase/supabase-js';

export const STUDY_MATERIAL_BUCKET = 'study-materials';
export const STUDY_MATERIAL_MAX_BYTES = 20 * 1024 * 1024;
export const STUDY_MATERIAL_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

const SCHOOL_EMAIL_PATTERN = /^[0-9]{6}@tokyo\.soka\.ed\.jp$/i;

export function getStudyMaterialsAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function ensureStudyMaterialsBucket() {
  const admin = getStudyMaterialsAdminClient();
  if (!admin) throw new Error('Supabaseのサーバー設定が不足しています。');

  const { data, error } = await admin.storage.getBucket(STUDY_MATERIAL_BUCKET);
  if (data && !error) {
    if (data.public) {
      const { error: updateError } = await admin.storage.updateBucket(STUDY_MATERIAL_BUCKET, {
        public: false,
        fileSizeLimit: STUDY_MATERIAL_MAX_BYTES,
        allowedMimeTypes: [...STUDY_MATERIAL_MIME_TYPES],
      });
      if (updateError) throw updateError;
    }
    return admin;
  }

  const { error: createError } = await admin.storage.createBucket(STUDY_MATERIAL_BUCKET, {
    public: false,
    fileSizeLimit: STUDY_MATERIAL_MAX_BYTES,
    allowedMimeTypes: [...STUDY_MATERIAL_MIME_TYPES],
  });
  if (createError && !/already exists|duplicate|409/i.test(createError.message || '')) {
    throw createError;
  }
  return admin;
}

export type StudyStudentContext = {
  admin: NonNullable<ReturnType<typeof getStudyMaterialsAdminClient>>;
  studentId: string;
  userClass: string;
};

export async function getStudyStudentContext(request: Request): Promise<StudyStudentContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.get('authorization') || '';
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!url || !publishableKey || !tokenMatch) return null;

  const token = tokenMatch[1].trim();
  if (!token) return null;

  const authResponse = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
    method: 'GET',
    headers: {
      apikey: publishableKey,
      Authorization: 'Bearer ' + token,
    },
    cache: 'no-store',
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) return null;

  const email = String(user.email || '').trim().toLowerCase();
  if (!SCHOOL_EMAIL_PATTERN.test(email)) return null;
  const studentId = email.split('@')[0];

  const admin = getStudyMaterialsAdminClient();
  if (!admin) throw new Error('Supabaseのサーバー設定が不足しています。');

  let profileResult = await admin
    .from('profiles')
    .select('student_id,user_class,auth_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profileResult.data && !profileResult.error) {
    profileResult = await admin
      .from('profiles')
      .select('student_id,user_class,auth_user_id')
      .eq('student_id', studentId)
      .maybeSingle();
  }

  const profile = profileResult.data;
  if (profileResult.error || !profile || profile.student_id !== studentId) return null;
  const userClass = String(profile.user_class || '');
  if (!/^[1-3]-[1-8]$/.test(userClass)) return null;

  return { admin, studentId, userClass };
}

export function canStudentViewMaterial(
  material: { target_scope: string; target_value: string | null },
  userClass: string,
): boolean {
  if (material.target_scope === 'all') return true;
  if (material.target_scope === 'grade') {
    return material.target_value === userClass.split('-')[0];
  }
  if (material.target_scope === 'class') {
    return material.target_value === userClass;
  }
  return false;
}

export function isValidMaterialStoragePath(value: unknown): value is string {
  return typeof value === 'string'
    && /^uploads\/[0-9a-f-]{36}\.(?:pdf|png|jpg|jpeg)$/i.test(value);
}
