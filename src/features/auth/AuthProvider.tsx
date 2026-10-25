import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Locale } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/shared/legal';

export type SignUpResult = { needsEmailConfirmation: boolean };

export type AuthApi = {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; locale: Locale }) => Promise<SignUpResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type AuthState = AuthApi & {
  session: Session | null;
  /** True until the stored session has been read on app start. */
  initializing: boolean;
  /** True while a password reset finishes, so navigation waits for it. */
  resetting: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => {
        if (mounted) setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback<AuthApi['signUp']>(async ({ email, password, locale }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Checked server-side by the sign-up trigger (see migrations).
        data: {
          age_confirmed: true,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          locale,
        },
      },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }, []);

  const completePasswordReset = useCallback(
    async (email: string, code: string, newPassword: string) => {
      setResetting(true);
      try {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
        if (error) throw error;
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          // Do not leave a half-finished recovery session behind.
          await supabase.auth.signOut();
          throw updateError;
        }
      } finally {
        setResetting(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      initializing,
      resetting,
      signIn,
      signUp,
      verifyEmail,
      resendConfirmation,
      requestPasswordReset,
      completePasswordReset,
      signOut,
    }),
    [
      session,
      initializing,
      resetting,
      signIn,
      signUp,
      verifyEmail,
      resendConfirmation,
      requestPasswordReset,
      completePasswordReset,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Exposed for tests that render screens with a fake auth implementation. */
export { AuthContext };
