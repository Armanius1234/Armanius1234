/**
 * Files in the browser. Same functions as files.ts (the phone version).
 */
import type { TextFileKind } from './files';

const MIME: Record<TextFileKind, string> = { json: 'application/json', csv: 'text/csv' };

/** The bytes of a photo picked or prepared in the browser (a blob: or data: address), for upload. */
export async function readBytes(localUri: string): Promise<ArrayBuffer> {
  const res = await fetch(localUri);
  if (!res.ok) throw new Error(`could not read ${localUri.slice(0, 16)}…`);
  return res.arrayBuffer();
}

/** Downloads a text file. (The share sheet title only exists on the phone.) */
export async function saveTextFile(name: string, contents: string, kind: TextFileKind, _dialogTitle: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([contents], { type: `${MIME[kind]};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
