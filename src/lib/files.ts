/**
 * Files on the phone: reading a photo for upload, and handing a text file
 * (data export, statistics) to the share sheet.
 * The browser version is files.web.ts; both export the same functions.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type TextFileKind = 'json' | 'csv';

const TYPES: Record<TextFileKind, { mimeType: string; UTI: string }> = {
  json: { mimeType: 'application/json', UTI: 'public.json' },
  csv: { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' },
};

/** The bytes of a photo picked or prepared on this device, for upload. */
export async function readBytes(localUri: string): Promise<ArrayBuffer> {
  return new File(localUri).arrayBuffer();
}

/** Saves a text file and opens the share sheet (phone) or downloads it (browser). */
export async function saveTextFile(name: string, contents: string, kind: TextFileKind, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(contents);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { ...TYPES[kind], dialogTitle });
  }
}
