/**
 * Session storage for Supabase Auth backed by the iOS Keychain / Android
 * Keystore (expo-secure-store).
 *
 * SecureStore values should stay small (about 2 KB), and Supabase sessions
 * can be bigger, so long values are split into numbered chunks.
 */

export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(store: KeyValueStore, chunkSize = CHUNK_SIZE) {
  const countKey = (key: string) => `${safeKey(key)}.n`;
  const partKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeItem(key: string): Promise<void> {
    const count = Number((await store.getItemAsync(countKey(key))) ?? '0');
    for (let i = 0; i < count; i++) {
      await store.deleteItemAsync(partKey(key, i));
    }
    await store.deleteItemAsync(countKey(key));
  }

  async function getItem(key: string): Promise<string | null> {
    const rawCount = await store.getItemAsync(countKey(key));
    if (rawCount === null) return null;
    const count = Number(rawCount);
    if (!Number.isInteger(count) || count < 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await store.getItemAsync(partKey(key, i));
      if (part === null) return null; // incomplete write: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  }

  async function setItem(key: string, value: string): Promise<void> {
    await removeItem(key);
    const count = Math.max(1, Math.ceil(value.length / chunkSize));
    for (let i = 0; i < count; i++) {
      await store.setItemAsync(partKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
    }
    // Written last so a half-finished write is never read back.
    await store.setItemAsync(countKey(key), String(count));
  }

  return { getItem, setItem, removeItem };
}
