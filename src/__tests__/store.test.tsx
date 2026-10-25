import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';

import MessagesScreen from '@/app/(tabs)/messages';
import SuspendedUsersScreen from '@/app/admin/suspended';
import EditPostScreen from '@/app/post/edit';
import { AuthContext } from '@/features/auth/AuthProvider';
import { changedSinceReport } from '@/features/moderation/snapshot';
import { I18nProvider } from '@/i18n';
import type { FeedPost, InboxItem, SuspendedUser } from '@/lib/database.types';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
const mockRpc = jest.fn((fn: string, _args?: unknown) => {
  const r = mockRpcResults[fn];
  if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message, code: 'P0001' } });
  return Promise.resolve({ data: r ?? null, error: null });
});
const mockUpdate = jest.fn((_row: unknown) => ({ eq: (..._a: unknown[]) => Promise.resolve({ error: null }) }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
    from: () => ({ update: (row: unknown) => mockUpdate(row) }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: {},
  },
  avatarUrl: () => null,
}));

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

const auth = {
  session: { user: { id: 'me' } } as never,
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

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider initial="en">
        <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function spyAlert() {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  return {
    spy,
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
  mockParams = {};
});

// --------------------------------------------------------------- edit post --
const post = {
  post_id: 'p1',
  author_id: 'me',
  caption: 'Golden hour',
  media_paths: [],
} as unknown as FeedPost;

describe('Edit caption', () => {
  it('starts with the saved caption and only saves a change', async () => {
    mockParams = { id: 'p1' };
    mockRpcResults = { get_posts: [post] };
    await wrap(<EditPostScreen />);
    const field = await screen.findByDisplayValue('Golden hour');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await fireEvent.changeText(field, '  Golden hour at the Ring  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ caption: 'Golden hour at the Ring' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

// ------------------------------------------------------------ delete chat ---
const chat: InboxItem = {
  conversation_id: 'c1',
  status: 'active',
  is_request_for_me: false,
  other_id: 'u2',
  other_username: 'lena',
  other_display_name: 'Lena',
  other_avatar_path: null,
  last_message: 'See you Saturday',
  last_message_mine: false,
  last_message_at: new Date().toISOString(),
  unread_count: 0,
};

describe('Delete chat for me', () => {
  it('asks first, explains it only affects you, then hides the chat', async () => {
    mockRpcResults = { my_conversations: [chat] };
    const alert = spyAlert();
    await wrap(<MessagesScreen />);
    await fireEvent(await screen.findByRole('button', { name: 'Lena' }), 'longPress');
    expect(alert.spy.mock.calls[0]?.[1]).toMatch(/removed for you only\. Lena still has it/);
    expect(mockRpc).not.toHaveBeenCalledWith('hide_conversation', expect.anything());
    alert.press('Delete chat');
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('hide_conversation', { p_conversation: 'c1' }));
  });
});

// ------------------------------------------------------ suspended accounts --
const suspended: SuspendedUser = {
  user_id: 'u9',
  username: 'cheap_rims_24',
  display_name: 'Cheap Rims',
  avatar_path: null,
  suspended_at: new Date().toISOString(),
  reason: 'Repeated scams',
};

describe('Suspended accounts (admin)', () => {
  it('is closed to non-admins', async () => {
    mockRpcResults = { am_i_admin: false };
    await wrap(<SuspendedUsersScreen />);
    expect(await screen.findByText('You are not allowed to do that.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_suspended_users', undefined);
  });

  it('needs a reason and a confirmation to lift a suspension', async () => {
    mockRpcResults = { am_i_admin: true, admin_suspended_users: [suspended] };
    const alert = spyAlert();
    await wrap(<SuspendedUsersScreen />);
    expect(await screen.findByText('“Repeated scams”')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '@cheap_rims_24' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Lift suspension' }));
    expect(screen.getByText('Please give a reason (at least 3 characters).')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Reason for lifting the suspension'), 'Appeal accepted');
    await fireEvent.press(screen.getByRole('button', { name: 'Lift suspension' }));
    expect(mockRpc).not.toHaveBeenCalledWith('admin_unsuspend_user', expect.anything());
    alert.press('Lift suspension');
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_unsuspend_user', { p_user: 'u9', p_note: 'Appeal accepted' }),
    );
  });
});

// --------------------------------------------------------- report snapshot --
describe('Report snapshot', () => {
  it('flags content that changed after the report, ignoring status flags', () => {
    expect(changedSinceReport({ snapshot: { caption: 'a', removed: false }, preview: { caption: 'a', removed: true } })).toBe(false);
    expect(changedSinceReport({ snapshot: { caption: 'a' }, preview: { caption: 'b' } })).toBe(true);
    expect(changedSinceReport({ snapshot: { body: 'insult' }, preview: null })).toBe(true);
    expect(changedSinceReport({ snapshot: null, preview: { caption: 'b' } })).toBe(false);
  });
});
