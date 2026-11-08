import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './authStorage';
import type { Database } from './database.types';
import { env } from './env';

// When the backend is not configured yet, a placeholder URL keeps the client
// constructible; the app shows a "Backend not configured" screen instead.
export const supabase = createClient<Database>(
  env.isConfigured ? env.supabaseUrl : 'https://not-configured.invalid',
  env.isConfigured ? env.supabaseKey : 'not-configured-placeholder-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // PKCE: a sign-in code caught by another app on the phone is useless
      // without the secret kept in this app's secure storage (browser: this
      // site's storage).
      flowType: 'pkce',
    },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase guidance
// for React Native).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
