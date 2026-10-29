/**
 * Which screen does the app show? Renders the real root layout (guards and
 * all) with stand-in screens, for each kind of account.
 */
import { Stack } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import * as AuthLayout from '@/app/(auth)/_layout';
import * as RootLayout from '@/app/_layout';
import * as SettingsLayout from '@/app/settings/_layout';

// ------------------------------------------------------------------ mocks ---
type Fake = { session: unknown; profile: unknown };
const mockState: Fake = { session: null, profile: null };

jest.mock('@/lib/supabase', () => {
  const single = (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: table === 'profiles' ? mockState.profile : { locale: 'en', push_enabled: false }, error: null }),
      }),
    }),
  });
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: mockState.session } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
      from: (table: string) => single(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
    avatarUrl: () => null,
  };
});
jest.mock('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: () => Promise.resolve(), hideAsync: () => Promise.resolve() }));

const stub = (label: string) =>
  function Stub() {
    return <Text>{label}</Text>;
  };
const stackLayout = () =>
  function Layout() {
    return <Stack screenOptions={{ headerShown: false }} />;
  };

// The real root layout; every screen is a stand-in that shows its name.
const routes = {
  _layout: RootLayout,
  'auth/callback': stub('CALLBACK'),
  '(auth)/_layout': AuthLayout,
  '(auth)/welcome': stub('WELCOME'),
  '(auth)/login': stub('LOGIN'),
  onboarding: stub('ONBOARDING'),
  suspended: stub('SUSPENDED'),
  'settings/_layout': SettingsLayout,
  'settings/index': stub('SETTINGS'),
  'settings/delete-account': stub('DELETE ACCOUNT'),
  '(tabs)/_layout': stackLayout(),
  '(tabs)/index': stub('HOME'),
  'post/[id]': stub('POST'),
};

const session = { user: { id: 'u1', email: 'u1@example.com', app_metadata: { provider: 'email' } } };
const profile = (suspended: boolean) => ({
  id: 'u1',
  username: 'lena_m',
  display_name: 'Lena',
  suspended_at: suspended ? new Date().toISOString() : null,
});

beforeEach(() => {
  mockState.session = null;
  mockState.profile = null;
});

describe('Which screen opens', () => {
  it('signed out: the welcome screen (not the sign-in return screen)', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('WELCOME')).toBeTruthy();
    expect(screen.queryByText('CALLBACK')).toBeNull();
  });

  it('signed out: app screens are locked', async () => {
    await renderRouter(routes, { initialUrl: '/post/123' });
    expect(await screen.findByText('WELCOME')).toBeTruthy();
    expect(screen.queryByText('POST')).toBeNull();
  });

  it('signed in without a profile: onboarding', async () => {
    mockState.session = session;
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('ONBOARDING')).toBeTruthy();
  });

  it('signed in with a profile: home', async () => {
    mockState.session = session;
    mockState.profile = profile(false);
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(screen.queryByText('SUSPENDED')).toBeNull();
  });

  it('suspended: only the suspension screen, even when opening a post link', async () => {
    mockState.session = session;
    mockState.profile = profile(true);
    await renderRouter(routes, { initialUrl: '/post/123' });
    expect(await screen.findByText('SUSPENDED')).toBeTruthy();
    expect(screen.queryByText('POST')).toBeNull();
    expect(screen.queryByText('HOME')).toBeNull();
  });

  it('suspended: account deletion stays reachable', async () => {
    mockState.session = session;
    mockState.profile = profile(true);
    await renderRouter(routes, { initialUrl: '/settings/delete-account' });
    expect(await screen.findByText('DELETE ACCOUNT')).toBeTruthy();
  });

  it('the sign-in return link opens its screen in any state', async () => {
    await renderRouter(routes, { initialUrl: '/auth/callback?code=abc' });
    await waitFor(() => expect(screen.getByText('CALLBACK')).toBeTruthy());
  });
});
