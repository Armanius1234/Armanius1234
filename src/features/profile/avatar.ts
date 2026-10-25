/**
 * Profile photo: pick → square crop → resize to 512 px → re-encode as JPEG
 * → upload into the user's own folder in the "avatars" bucket.
 * Re-encoding produces a fresh file, so the original photo's metadata
 * (for example GPS location) is not uploaded.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export class PhotoPermissionError extends Error {
  constructor() {
    super('photo_permission');
    this.name = 'PhotoPermissionError';
  }
}

export class UploadError extends Error {
  constructor(cause?: unknown) {
    super('upload_failed');
    this.name = 'UploadError';
    this.cause = cause;
  }
}

/** Returns a local URI of the prepared image, or null if the user cancelled. */
export async function pickAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const rendered = await ImageManipulator.manipulate(result.assets[0].uri)
    .resize({ width: 512 })
    .renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

function randomName(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Uploads a prepared image and returns its storage path. */
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const path = `${userId}/${randomName()}.jpg`;
  try {
    const bytes = await new File(localUri).arrayBuffer();
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
