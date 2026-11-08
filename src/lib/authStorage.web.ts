/**
 * Where the login session is kept in the browser: localStorage, like most
 * websites that use Supabase. If the browser blocks storage (some private
 * windows, embedded previews), it is kept in memory instead: the person stays
 * signed in until the page is closed or reloaded.
 */
type SyncStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createWebAuthStorage(candidate: () => SyncStore | undefined) {
  let store: SyncStore | null | undefined;
  const memory = new Map<string, string>();

  function backend(): SyncStore | null {
    if (store !== undefined) return store;
    try {
      const s = candidate();
      if (!s) throw new Error('no storage');
      s.setItem('pl8.probe', '1');
      s.removeItem('pl8.probe');
      store = s;
    } catch {
      store = null;
    }
    return store;
  }

  return {
    getItem(key: string): string | null {
      const s = backend();
      return s ? s.getItem(key) : (memory.get(key) ?? null);
    },
    setItem(key: string, value: string): void {
      const s = backend();
      if (s) s.setItem(key, value);
      else memory.set(key, value);
    },
    removeItem(key: string): void {
      const s = backend();
      if (s) s.removeItem(key);
      else memory.delete(key);
    },
  };
}

export const authStorage = createWebAuthStorage(() => globalThis.localStorage);
