import { looksLikeSecretKey } from '@/lib/env';
import { errorKey } from '@/lib/errors';
import { createChunkedStorage, safeKey, type KeyValueStore } from '@/lib/secureStorage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      data.set(k, v);
    },
    deleteItemAsync: async (k) => {
      data.delete(k);
    },
  };
}

describe('chunked secure storage', () => {
  it('round-trips short and long values', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store, 10);
    await storage.setItem('sb-abc-auth-token', 'short');
    expect(await storage.getItem('sb-abc-auth-token')).toBe('short');

    const long = 'x'.repeat(95);
    await storage.setItem('sb-abc-auth-token', long);
    expect(await storage.getItem('sb-abc-auth-token')).toBe(long);
    // 10 chunks + count key; the old single chunk was replaced, not left behind
    expect(store.data.size).toBe(11);
  });

  it('removes every chunk', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store, 10);
    await storage.setItem('k', 'y'.repeat(35));
    await storage.removeItem('k');
    expect(store.data.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('treats a missing chunk as signed out', async () => {
    const store = memoryStore();
    const storage = createChunkedStorage(store, 10);
    await storage.setItem('k', 'z'.repeat(25));
    store.data.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('sanitizes keys for SecureStore', () => {
    expect(safeKey('sb://weird key@1')).toBe('sb___weird_key_1');
  });
});

describe('looksLikeSecretKey', () => {
  const jwt = (payload: object) => `xx.${btoa(JSON.stringify(payload))}.yy`;

  it('flags secret keys and service_role JWTs', () => {
    expect(looksLikeSecretKey('sb_secret_abc123')).toBe(true);
    expect(looksLikeSecretKey(jwt({ role: 'service_role' }))).toBe(true);
  });
  it('allows publishable keys and anon JWTs', () => {
    expect(looksLikeSecretKey('sb_publishable_abc123')).toBe(false);
    expect(looksLikeSecretKey(jwt({ role: 'anon' }))).toBe(false);
  });
});

describe('errorKey', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'errors.invalid_credentials'],
    [{ code: 'email_not_confirmed' }, 'errors.email_not_confirmed'],
    [{ code: 'otp_expired' }, 'errors.code_expired'],
    [{ code: 'over_email_send_rate_limit' }, 'errors.rate_limited'],
    [{ message: 'Database error saving new user' }, 'errors.signup_rejected'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }, 'errors.username_taken'],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 'errors.permission_denied'],
    [{ name: 'TypeError', message: 'Network request failed' }, 'errors.network'],
    [{ name: 'PhotoPermissionError' }, 'errors.photo_permission'],
    [{ name: 'UploadError' }, 'errors.upload_failed'],
    [{ message: 'something unexpected' }, 'errors.unknown'],
    [null, 'errors.unknown'],
  ])('%j → %s', (input, expected) => {
    expect(errorKey(input)).toBe(expected);
  });
});
