import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Platform, type AlertButton } from 'react-native';

import AuthCallbackScreen from '@/app/auth/callback';
import DeleteAccountScreen from '@/app/settings/delete-account';
import { AuthContext } from '@/features/auth/AuthProvider';
import { ConsentStep } from '@/features/auth/ConsentStep';
import {
  accountProvider,
  availableProviders,
  completeOAuthFromUrl,
  signInWithProvider,
} from '@/features/auth/social';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { I18nProvider } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/shared/legal';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
const mockCalls: string[] = [];
const mockRpc = jest.fn((fn: string, _args?: unknown) => {
  mockCalls.push(`rpc:${fn}`);
  const r = mockRpcResults[fn];
  if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message, code: 'P0001' } });
  return Promise.resolve({ data: r ?? null, error: null });
});
const mockAuth = {
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  getSession: jest.fn(),
  signInWithIdToken: jest.fn(),
  updateUser: jest.fn(),
  signInWithPassword: jest.fn(),
  getUser: jest.fn(),
  signOut: jest.fn((_o?: unknown) => {
    mockCalls.push('signOut');
    return Promise.resolve({ error: null });
  }),
};
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
    // Read lazily: jest.mock runs before this file's constants exist.
    get auth() {
      return mockAuth;
    },
    from: () => {
      const q = { select: () => q, eq: () => Promise.resolve({ data: [], error: null }), delete: () => q };
      return q;
    },
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  },
  avatarUrl: () => null,
}));

const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a),
  maybeCompleteAuthSession: jest.fn(),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `pl8://${path}` }));
const mockAppleSignIn = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  signInAsync: (...a: unknown[]) => mockAppleSignIn(...a),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { CONTINUE: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 0 },
  AppleAuthenticationButton: () => null,
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'raw-nonce-123',
  digestStringAsync: (_alg: unknown, value: string) => Promise.resolve(`sha256(${value})`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
jest.mock('@/features/notifications/push', () => ({ unregisterPush: () => Promise.resolve() }));
jest.mock('@/features/profile/api', () => ({ useMyProfile: () => ({ data: { username: 'lena_m' } }) }));

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: ReactNode }) => children,
}));

function authWith(user: Record<string, unknown> | null) {
  return {
    session: user ? ({ user } as never) : null,
    initializing: false,
    resetting: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    verifyEmail: jest.fn(),
    resendConfirmation: jest.fn(),
    requestPasswordReset: jest.fn(),
    completePasswordReset: jest.fn(),
    signOut: jest.fn(),
  };
}

function wrap(ui: ReactNode, user: Record<string, unknown> | null = { id: 'me', email: 'me@example.com', app_metadata: { provider: 'google' } }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider initial="en">
        <AuthContext.Provider value={authWith(user)}>{ui}</AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function spyAlert() {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  return {
    press(label: string) {
      const buttons = (spy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[];
      const b = buttons.find((x) => x.text === label);
      if (!b) throw new Error(`No alert button "${label}" in [${buttons.map((x) => x.text).join(', ')}]`);
      b.onPress?.();
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockRpcResults = {};
  mockCalls.length = 0;
  mockParams = {};
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
});

// ------------------------------------------------------------ which buttons --
describe('Which sign-in buttons appear', () => {
  it('shows nothing until a provider is switched on', () => {
    expect(availableProviders('ios', { apple: false, google: false })).toEqual([]);
    expect(availableProviders('android', { apple: false, google: false })).toEqual([]);
  });

  it('never offers Google on iPhone without Apple (App Store rule 4.8)', () => {
    expect(availableProviders('ios', { apple: false, google: true })).toEqual([]);
    expect(availableProviders('ios', { apple: true, google: true })).toEqual(['apple', 'google']);
    expect(availableProviders('android', { apple: false, google: true })).toEqual(['google']);
  });

  it('offers Apple only on iPhone', () => {
    expect(availableProviders('android', { apple: true, google: true })).toEqual(['google']);
    expect(availableProviders('ios', { apple: true, google: false })).toEqual(['apple']);
  });

  it('is off by default in this build (no flags set)', async () => {
    expect(availableProviders()).toEqual([]);
    await wrap(<SocialButtons />, null);
    expect(screen.queryByText('Continue with Google')).toBeNull();
  });

  it('knows how an account signs in', () => {
    expect(accountProvider({ provider: 'google' })).toBe('google');
    expect(accountProvider({ provider: 'apple' })).toBe('apple');
    expect(accountProvider({ provider: 'email' })).toBe('email');
    expect(accountProvider(undefined)).toBe('email');
  });
});

// ------------------------------------------------------- browser sign-in ----
describe('Google sign-in (browser, PKCE)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockAuth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://x.supabase.co/auth/v1/authorize?provider=google' }, error: null });
  });

  it('opens the provider page and exchanges the returned code', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'success', url: 'pl8://auth/callback?code=abc123' });
    await expect(signInWithProvider('google')).resolves.toBe('signed_in');
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'pl8://auth/callback', skipBrowserRedirect: true },
    });
    expect(mockOpenAuthSession).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/authorize?provider=google', 'pl8://auth/callback');
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('treats closing the page as cancel, without an error', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    await expect(signInWithProvider('google')).resolves.toBe('cancelled');
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe('Finishing a browser sign-in', () => {
  it('treats "access denied" as cancel', async () => {
    await expect(completeOAuthFromUrl('pl8://auth/callback?error=access_denied')).resolves.toBe('cancelled');
  });

  it('shows a clear message for other provider errors, never the raw text', async () => {
    const e = await completeOAuthFromUrl('pl8://auth/callback#error=server_error&error_description=boom').catch((x: unknown) => x);
    expect(errorKey(e)).toBe('errors.social_failed');
  });

  it('accepts a second delivery of the same link once signed in', async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: 'invalid flow state' } });
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
    await expect(completeOAuthFromUrl('pl8://auth/callback?code=used')).resolves.toBe('signed_in');
  });

  it('fails when there is no code', async () => {
    await expect(completeOAuthFromUrl('pl8://auth/callback')).rejects.toThrow('missing_code');
  });

  it('the return screen finishes the sign-in and moves on', async () => {
    mockParams = { code: 'from-link' };
    await wrap(<AuthCallbackScreen />, null);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('from-link');
  });
});

// ---------------------------------------------------------- Apple on iOS ----
describe('Apple sign-in on iPhone (native)', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  it('sends the hashed nonce to Apple and the raw one to Supabase', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-jwt', fullName: { givenName: 'Lena', familyName: 'M' } });
    mockAuth.signInWithIdToken.mockResolvedValue({ data: {}, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await expect(signInWithProvider('apple')).resolves.toBe('signed_in');
    expect(mockAppleSignIn).toHaveBeenCalledWith({ requestedScopes: [0, 1], nonce: 'sha256(raw-nonce-123)' });
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-jwt', nonce: 'raw-nonce-123' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Lena M' } });
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it('treats closing the Apple sheet as cancel', async () => {
    mockAppleSignIn.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    await expect(signInWithProvider('apple')).resolves.toBe('cancelled');
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------ consent step --
describe('Consent step for Apple / Google sign-ups', () => {
  it('needs both confirmations before anything is sent', async () => {
    await wrap(<ConsentStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('You must be 18 or older to use PL8.')).toBeTruthy();
    expect(screen.getByText('Please accept the Terms and Privacy Policy.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('records 18+, the accepted versions and the language', async () => {
    await wrap(<ConsentStep />);
    await fireEvent.press(screen.getByText('I confirm that I am 18 years or older.'));
    await fireEvent.press(screen.getByText('I accept the Terms of Use and have read the Privacy Policy.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('record_consent', {
        p_age_confirmed: true,
        p_terms_version: TERMS_VERSION,
        p_privacy_version: PRIVACY_VERSION,
        p_locale: 'en',
      }),
    );
  });

  it('cancelling deletes the new login and signs out', async () => {
    const alert = spyAlert();
    await wrap(<ConsentStep />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel and delete this login' }));
    alert.press('Cancel and delete this login');
    await waitFor(() => expect(mockCalls).toEqual(['rpc:delete_my_account', 'signOut']));
  });
});

// ------------------------------------------- delete account (social) -------
describe('Deleting an Apple / Google account', () => {
  it('asks for the username instead of a password, and checks it', async () => {
    await wrap(<DeleteAccountScreen />);
    expect(screen.getByText('You sign in with Google, so there is no password to enter.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Type your username (lena_m) to confirm'), 'someone_else');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
    expect(screen.getByText('That is not your username.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('with the right username: deletes files, then the account, then signs out (no password)', async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
    const alert = spyAlert();
    await wrap(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Type your username (lena_m) to confirm'), ' Lena_M ');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
    alert.press('Delete account');
    await waitFor(() => expect(mockCalls).toEqual(['rpc:delete_my_account', 'signOut']));
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('email accounts still need the password', async () => {
    await wrap(<DeleteAccountScreen />, { id: 'me', email: 'me@example.com', app_metadata: { provider: 'email' } });
    expect(screen.getByLabelText('Enter your password to confirm')).toBeTruthy();
    expect(screen.queryByText(/so there is no password/)).toBeNull();
  });
});
