/**
 * @module platform/supabase/storage
 * Private Supabase Storage adapter (`pin-photos` bucket) enforcing per-user
 * object paths `<user_id>/<pin_id>.<ext>` and short-lived signed URLs only.
 */
import { getSupabaseClient } from './client';

const PHOTO_BUCKET = 'pin-photos';
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Uploads an EXIF-stripped compressed photo blob into the user's private Storage folder.
 * @param {string} userId - Authenticated Supabase user UUID.
 * @param {string} pinId - Pin UUID.
 * @param {Blob} blob - Compressed, EXIF-free WebP or JPEG blob.
 * @param {'image/webp' | 'image/jpeg'} mimeType - Encoded MIME type.
 * @returns {Promise<string | null>} Storage object path `<userId>/<pinId>.<ext>` or null if offline.
 * @throws {Error} When Supabase Storage upload fails.
 */
export async function uploadPrivatePinPhoto(
  userId: string,
  pinId: string,
  blob: Blob,
  mimeType: 'image/webp' | 'image/jpeg',
): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const objectPath = `${userId}/${pinId}.${ext}`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(objectPath, blob, {
    contentType: mimeType,
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    throw new Error(`Private photo upload failed: ${error.message}`);
  }

  return objectPath;
}

/**
 * Generates a short-lived (5-minute) signed URL for a private pin photo.
 * @param {string} storagePath - Object path `<userId>/<pinId>.<ext>`.
 * @returns {Promise<string | null>} Short-lived signed URL or null when unavailable.
 */
export async function getPrivatePinPhotoSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !storagePath) return null;

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
