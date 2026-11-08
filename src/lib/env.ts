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

/** Testing the web version on this computer (http://localhost). */
export function isLocalhost(hostname: string | undefined): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/** Where the local setup form saves the two values (localhost only). */
export const LOCAL_CONFIG_KEY = 'pl8.localConfig';

/** The values saved by the local setup form; empty if none or unreadable. */
export function browserConfig(storage: Pick<Storage, 'getItem'> | undefined): { url: string; key: string } {
  try {
    const raw = storage?.getItem(LOCAL_CONFIG_KEY);
    return runtimeConfig({ PL8_CONFIG: raw ? JSON.parse(raw) : undefined });
  } catch {
    return { url: '', key: '' };
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export type ConfigSource = 'build' | 'file' | 'browser' | 'none';

/**
 * Which values the app uses, first match wins:
 * 1. .env (built into the app)
 * 2. pl8-config.js / the settings block in index.html (web version)
 * 3. the local setup form (web version on localhost only)
 */
export function chooseConfig(
  build: { url: string; key: string },
  file: { url: string; key: string },
  local: { url: string; key: string },
): { url: string; key: string; source: ConfigSource } {
  if (build.url) return { ...build, source: 'build' };
  if (file.url) return { ...file, source: 'file' };
  // A secret key can't be saved by the form; ignore one that got in some other way.
  if (local.url && !looksLikeSecretKey(local.key)) return { ...local, source: 'browser' };
  return { url: '', key: '', source: 'none' };
}

const chosen = chooseConfig(
  { url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '', key: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '' },
  runtimeConfig(),
  isLocalhost(globalThis.location?.hostname) ? browserConfig(browserStorage()) : { url: '', key: '' },
);
const url = chosen.url;
const key = chosen.key;

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
  configSource: chosen.source,
  isConfigured: /^https:\/\/.+/.test(url) && key.length > 20,
  authApple: flag(process.env.EXPO_PUBLIC_AUTH_APPLE),
  authGoogle: flag(process.env.EXPO_PUBLIC_AUTH_GOOGLE),
} as const;
