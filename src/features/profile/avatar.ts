/**
 * Profile photo: pick → square crop → resize to 512 px → JPEG
 * → upload into the user's own folder in the public "avatars" bucket.
 */
import { pickImage, randomFileName, readBytes, UploadError } from '@/lib/images';
import { supabase } from '@/lib/supabase';

export { PhotoPermissionError, UploadError } from '@/lib/images';

/** Returns a local URI of the prepared image, or null if the user cancelled. */
export async function pickAvatar(): Promise<string | null> {
  const image = await pickImage({ source: 'library', square: true, maxSize: 512 });
  return image?.uri ?? null;
}

/** Uploads a prepared image and returns its storage path. */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/${randomFileName()}.jpg`;
  try {
    const bytes = await readBytes(localUri);
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  } catch (e) {
    throw new UploadError(e);
  }
}

/** Best-effort removal of a replaced avatar. */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from('avatars').remove([path]);
}
