/**
 * The local setup form of the web version (only on http://localhost): saves
 * the two PUBLIC Supabase values in this browser, so the app can be tried on
 * a computer without editing any file. env.ts reads them on the next start.
 */
import { LOCAL_CONFIG_KEY, looksLikeSecretKey } from './env';

export type LocalConfigProblem = 'url' | 'key' | 'secret';

export function checkLocalConfig(url: string, key: string): LocalConfigProblem | null {
  if (!/^https:\/\/[^\s/]+\.[^\s/]+\/?$/.test(url.trim())) return 'url';
  if (looksLikeSecretKey(key.trim())) return 'secret';
  if (key.trim().length <= 20 || /\s/.test(key.trim())) return 'key';
  return null;
}

type Store = Pick<Storage, 'setItem' | 'removeItem'>;

export function saveLocalConfig(url: string, key: string, storage: Store = globalThis.localStorage): void {
  const problem = checkLocalConfig(url, key);
  if (problem) throw new Error(`invalid local config: ${problem}`);
  storage.setItem(LOCAL_CONFIG_KEY, JSON.stringify({ supabaseUrl: url.trim().replace(/\/$/, ''), supabaseKey: key.trim() }));
}

export function clearLocalConfig(storage: Store = globalThis.localStorage): void {
  storage.removeItem(LOCAL_CONFIG_KEY);
}

/** The new values are read when the app starts, so start it again. */
export function restartApp(): void {
  globalThis.location?.reload();
}
