import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import RegisterScreen from '@/app/(auth)/register';
import { AuthContext, type AuthApi } from '@/features/auth/AuthProvider';
import { useUsernameCheck } from '@/features/profile/useUsernameCheck';
import { I18nProvider } from '@/i18n';
import { Button } from '@/ui';

// No network in unit tests: replace the Supabase client and the router.
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), auth: {}, from: jest.fn(), storage: { from: jest.fn() } },
  avatarUrl: () => null,
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
    Link: ({ children }: { children: ReactNode }) => children,
    useLocalSearchParams: () => ({}),
    Pressable,
  };
});

jest.mock('@/features/profile/api', () => ({
  checkUsernameAvailable: jest.fn(),
}));

function makeAuth(overrides: Partial<AuthApi> = {}) {
  const api: AuthApi = {
    signIn: jest.fn(),
    signUp: jest.fn().mockResolvedValue({ needsEmailConfirmation: true }),
    verifyEmail: jest.fn(),
    resendConfirmation: jest.fn(),
    requestPasswordReset: jest.fn(),
    completePasswordReset: jest.fn(),
    signOut: jest.fn(),
    ...overrides,
  };
  return { ...api, session: null, initializing: false, resetting: false };
}

async function wrap(ui: ReactNode, auth = makeAuth()) {
  return render(
    <I18nProvider initial="en">
      <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
    </I18nProvider>,
  );
}

describe('Button', () => {
  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Go" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and shows a spinner while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Go" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.queryByText('Go')).toBeNull();
  });
});

describe('Register screen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('does not sign up without 18+ confirmation and terms', async () => {
    const auth = makeAuth();
    await wrap(<RegisterScreen />, auth);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'max@example.de');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'carlover2026');
    await fireEvent.changeText(screen.getByLabelText('Repeat password'), 'carlover2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('You must be 18 or older to use PL8.')).toBeTruthy();
    expect(screen.getByText('Please accept the Terms and Privacy Policy.')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('shows field errors for invalid email and mismatched passwords', async () => {
    const auth = makeAuth();
    await wrap(<RegisterScreen />, auth);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'nope');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'carlover2026');
    await fireEvent.changeText(screen.getByLabelText('Repeat password'), 'different2026');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Please enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('signs up with a valid form and goes to email verification', async () => {
    const auth = makeAuth();
    await wrap(<RegisterScreen />, auth);
    await fireEvent.changeText(screen.getByLabelText('Email'), ' Max@Example.de ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'carlover2026');
    await fireEvent.changeText(screen.getByLabelText('Repeat password'), 'carlover2026');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I confirm that I am 18 years or older.' }));
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'I accept the Terms of Use and have read the Privacy Policy.' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(auth.signUp).toHaveBeenCalledWith({ email: 'max@example.de', password: 'carlover2026', locale: 'en' }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/verify-email', params: { email: 'max@example.de' } }),
    );
  });

  it('shows a readable message when the server rejects sign-up', async () => {
    const auth = makeAuth({
      signUp: jest.fn().mockRejectedValue({ code: 'over_email_send_rate_limit', message: 'rate limit' }),
    });
    await wrap(<RegisterScreen />, auth);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'max@example.de');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'carlover2026');
    await fireEvent.changeText(screen.getByLabelText('Repeat password'), 'carlover2026');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I confirm that I am 18 years or older.' }));
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'I accept the Terms of Use and have read the Privacy Policy.' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Too many attempts. Please wait a moment and try again.')).toBeTruthy();
  });
});

describe('useUsernameCheck', () => {
  const { checkUsernameAvailable } = jest.requireMock('@/features/profile/api') as {
    checkUsernameAvailable: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    checkUsernameAvailable.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('rejects invalid names without calling the server', async () => {
    const { result } = await renderHook(() => useUsernameCheck('a..b'));
    expect(result.current).toEqual({ state: 'invalid', reason: 'username_format' });
    expect(checkUsernameAvailable).not.toHaveBeenCalled();
  });

  it('treats the current username as available without a server call', async () => {
    const { result } = await renderHook(() => useUsernameCheck('alice_m2', 'alice_m2'));
    expect(result.current).toEqual({ state: 'available' });
    expect(checkUsernameAvailable).not.toHaveBeenCalled();
  });

  it('debounces and reports the server answer', async () => {
    checkUsernameAvailable.mockResolvedValue(false);
    const { result, rerender } = await renderHook(({ v }: { v: string }) => useUsernameCheck(v), {
      initialProps: { v: 'ali' },
    });
    await rerender({ v: 'alice' });
    expect(result.current).toEqual({ state: 'checking' });
    await act(async () => {
      jest.advanceTimersByTime(450);
    });
    expect(checkUsernameAvailable).toHaveBeenCalledTimes(1);
    expect(checkUsernameAvailable).toHaveBeenCalledWith('alice');
    expect(result.current).toEqual({ state: 'taken' });
  });
});
