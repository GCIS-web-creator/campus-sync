import type { SupabaseClient } from '@supabase/supabase-js';

export const PROFILE_IMAGE_BUCKET = 'profile-images';
export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

export async function ensureProfileImagesBucket(admin: SupabaseClient) {
  const allowedMimeTypes = ['image/webp'];
  const { data, error } = await admin.storage.getBucket(PROFILE_IMAGE_BUCKET);
  if (data && !error) {
    if (data.public) throw new Error('プロフィール画像用バケットは非公開である必要があります。');
    const { error: updateError } = await admin.storage.updateBucket(PROFILE_IMAGE_BUCKET, {
      public: false, fileSizeLimit: PROFILE_IMAGE_MAX_BYTES, allowedMimeTypes,
    });
    if (updateError) throw updateError;
    return;
  }
  const { error: createError } = await admin.storage.createBucket(PROFILE_IMAGE_BUCKET, {
    public: false, fileSizeLimit: PROFILE_IMAGE_MAX_BYTES, allowedMimeTypes,
  });
  if (createError && !/already exists|duplicate|409/i.test(createError.message || '')) throw createError;
  const { data: verify, error: verifyError } = await admin.storage.getBucket(PROFILE_IMAGE_BUCKET);
  if (verifyError || !verify || verify.public) throw new Error('非公開プロフィール画像バケットを確認できませんでした。');
}

export function isProfileImagePath(value: unknown, userId: string, kind?: 'avatar' | 'banner'): value is string {
  if (typeof value !== 'string') return false;
  const parts = value.split('/');
  if (parts.length !== 3 || parts[0] !== userId) return false;
  if (kind ? parts[1] !== kind : !['avatar', 'banner'].includes(parts[1])) return false;
  return UUID_FILE.test(parts[2]);
}
