/**
 * Picking and preparing photos before upload.
 * Every photo is resized and re-encoded as JPEG on the phone, so uploads stay
 * small and the original file's metadata (for example GPS) is not uploaded.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export class PhotoPermissionError extends Error {
  constructor(kind: 'library' | 'camera' = 'library') {
    super(kind === 'camera' ? 'camera_permission' : 'photo_permission');
    this.name = kind === 'camera' ? 'CameraPermissionError' : 'PhotoPermissionError';
  }
}

export class UploadError extends Error {
  constructor(cause?: unknown) {
    super('upload_failed');
    this.name = 'UploadError';
    this.cause = cause;
  }
}

export type PreparedImage = { uri: string; width: number; height: number };

type PickOptions = {
  source: 'library' | 'camera';
  /** Square crop (avatars). */
  square?: boolean;
  /** Longest side after resizing. */
  maxSize: number;
};

export async function pickImage({ source, square, maxSize }: PickOptions): Promise<PreparedImage | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('camera');
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new PhotoPermissionError('library');
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: !!square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  const landscape = asset.width >= asset.height;
  const resize = landscape ? { width: Math.min(maxSize, asset.width) } : { height: Math.min(maxSize, asset.height) };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export function randomFileName(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function readBytes(localUri: string): Promise<ArrayBuffer> {
  return new File(localUri).arrayBuffer();
}
