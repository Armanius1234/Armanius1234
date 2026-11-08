/**
 * Public configuration. Only values that are safe to ship inside the app
 * belong here (EXPO_PUBLIC_* is bundled into the app and readable by anyone).
 * NEVER put the Supabase service-role / secret key in an EXPO_PUBLIC_ variable.
 */
type RuntimeConfig = { supabaseUrl?: unknown; supabaseKey?: unknown };

/**
 * The web version can also read the two public values from pl8-config.js
 * (public/pl8-config.js, loaded by public/index.html before the app), so a
 * finished build can be connected to a Supabase project without rebuilding.
 * Values from .env win. The phone app never loads that file.
 */
export function runtimeConfig(source: unknown = globalThis): { url: string; key: string } {
  const cfg = (source as { PL8_CONFIG?: RuntimeConfig } | undefined)?.PL8_CONFIG;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return { url: text(cfg?.supabaseUrl), key: text(cfg?.supabaseKey) };
}

const runtime = runtimeConfig();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL || runtime.url;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY || runtime.key;

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
    'The Supabase key is a SECRET key. Use the publishable (anon) key instead and rotate the secret key now.',
  );
}

// Sign in with Apple / Google stay hidden until they are set up in Supabase
// (docs/SOCIAL-LOGIN-SETUP.md). Set to "on" to show the buttons.
const flag = (v: string | undefined) => v === 'on';

export const env = {
  supabaseUrl: url,
  supabaseKey: key,
  isConfigured: /^https:\/\/.+/.test(url) && key.length > 20,
  authApple: flag(process.env.EXPO_PUBLIC_AUTH_APPLE),
  authGoogle: flag(process.env.EXPO_PUBLIC_AUTH_GOOGLE),
} as const;
