/**
 * Public configuration. Only values that are safe to ship inside the app
 * belong here (EXPO_PUBLIC_* is bundled into the app and readable by anyone).
 * NEVER put the Supabase service-role / secret key in an EXPO_PUBLIC_ variable.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export function looksLikeSecretKey(value: string): boolean {
  if (value.startsWith('sb_secret_')) return true;
  // Legacy JWT keys: refuse a service_role token.
  const payload = value.split('.')[1];
  if (!payload) return false;
  try {
    const json = globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

if (looksLikeSecretKey(key)) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_KEY is a SECRET key. Use the publishable (anon) key instead and rotate the secret key now.',
  );
}

export const env = {
  supabaseUrl: url,
  supabaseKey: key,
  isConfigured: /^https:\/\/.+/.test(url) && key.length > 20,
} as const;
