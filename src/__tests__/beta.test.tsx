import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ReportDetailScreen from '@/app/admin/report/[id]';
import ReportsQueueScreen from '@/app/admin/reports';
import NotificationsScreen from '@/app/notifications';
import ReportScreen from '@/app/report';
import DeleteAccountScreen from '@/app/settings/delete-account';
import { AuthContext } from '@/features/auth/AuthProvider';
import { pushHref, registerForPush } from '@/features/notifications/push';
import { notificationText } from '@/features/notifications/text';
import { CrashScreen } from '@/features/system/CrashScreen';
import { OfflineBanner } from '@/features/system/OfflineBanner';
import { I18nProvider, translate, type TKey, type TParams } from '@/i18n';
import type { NotificationItem, ReportQueueItem } from '@/lib/database.types';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
const mockCalls: string[] = [];
const mockRpc = jest.fn((fn: string, _args?: unknown) => {
  mockCalls.push(`rpc:${fn}`);
  const r = mockRpcResults[fn];
  if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message, code: 'P0001' } });
  return Promise.resolve({ data: r ?? null, error: null });
});
const mockSignIn = jest.fn();
const mockSignOut = jest.fn((_o?: unknown) => {
  mockCalls.push('signOut');
  return Promise.resolve({ error: null });
});
const mockRemove = jest.fn((paths: string[]) => {
  mockCalls.push(`remove:${paths.join(',')}`);
  return Promise.resolve({ data: [], error: null });
});
// Storage: the user has one avatar and nothing else.
const mockList = jest.fn((folder: string) =>
  Promise.resolve({ data: folder === 'me' ? [{ name: 'a.jpg', id: 'f1' }] : [], error: null }),
);

jest.mock('@/lib/supabase', () => {
  const rows = () => {
    const q = { select: () => q, eq: () => Promise.resolve({ data: [], error: null }), delete: () => q };
    return q;
  };
  return {
    supabase: {
      rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
      from: () => rows(),
      storage: {
        from: (bucket: string) => ({
          list: (folder: string) => (bucket === 'avatars' ? mockList(folder) : Promise.resolve({ data: [], error: null })),
          remove: (paths: string[]) => mockRemove(paths),
          createSignedUrls: () => Promise.resolve({ data: [], error: null }),
        }),
      },
      auth: {
        signInWithPassword: (a: unknown) => mockSignIn(a),
        signOut: (o: unknown) => mockSignOut(o),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => Promise.resolve(),
    },
    avatarUrl: () => null,
  };
});

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    Stack: { Screen: () => null },
    Link: ({ children }: { children: ReactNode }) => children,
  };
});

const mockDevice = { isDevice: false };
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  AndroidImportance: { HIGH: 4 },
}));

let mockConnected: boolean | null = true;
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: mockConnected }),
}));

const auth = {
  session: { user: { id: 'me', email: 'me@example.com' } } as never,
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

/** Captures Alert.alert calls; `press(label)` taps a button of the last alert. */
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

const UUID1 = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockRpcResults = {};
  mockCalls.length = 0;
  mockParams = {};
  mockConnected = true;
  mockDevice.isDevice = false;
});

// -------------------------------------------------------------- push --------
describe('Push notifications', () => {
  it('opens the right screen for a tapped push', () => {
    expect(pushHref({ type: 'message', conversation_id: UUID1 })).toEqual({ pathname: '/chat/[id]', params: { id: UUID1 } });
    expect(pushHref({ type: 'comment', post_id: UUID1 })).toEqual({ pathname: '/post/[id]', params: { id: UUID1 } });
    expect(pushHref({ type: 'verification_approved', vehicle_id: UUID1 })).toEqual({
      pathname: '/vehicle/[id]/plate',
      params: { id: UUID1 },
    });
  });

  it('falls back to the notification list for unknown or malformed data', () => {
    expect(pushHref({ type: 'message', conversation_id: '../../settings' })).toBe('/notifications');
    expect(pushHref({ type: 'something-new' })).toBe('/notifications');
    expect(pushHref({})).toBe('/notifications');
  });

  it('does nothing on a simulator / without a build and never stores a token', async () => {
    await expect(registerForPush({ ask: true })).resolves.toBe('unavailable');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- notification text --
const note = (over: Partial<NotificationItem>): NotificationItem => ({
  notification_id: 'n1',
  type: 'like',
  actor_username: 'ann',
  actor_display_name: 'Ann',
  actor_avatar_path: null,
  post_id: UUID1,
  vehicle_id: null,
  data: {},
  read: false,
  created_at: new Date().toISOString(),
  ...over,
});

describe('Notification texts', () => {
  const t = (k: TKey, p?: TParams) => translate('en', k, p);
  const tDe = (k: TKey, p?: TParams) => translate('de', k, p);

  it('builds the sentence for each kind', () => {
    expect(notificationText(t, note({ type: 'like' }))).toBe('Ann liked your post');
    expect(notificationText(t, note({ type: 'comment', data: { excerpt: 'Clean!' } }))).toBe('Ann commented: Clean!');
    expect(notificationText(t, note({ type: 'content_removed', actor_display_name: null, data: { target_type: 'comment', reason: 'spam' } }))).toBe(
      'Your comment was removed for breaking the community rules (Spam or scam).',
    );
  });

  it('never shows a raw key, in either language, for any kind', () => {
    const kinds: NotificationItem['type'][] = [
      'follow',
      'follow_request',
      'follow_accepted',
      'like',
      'comment',
      'verification_approved',
      'verification_rejected',
      'plate_transferred',
      'plate_revoked',
      'report_resolved',
      'content_removed',
    ];
    for (const type of kinds) {
      for (const tr of [t, tDe]) {
        const text = notificationText(tr, note({ type, data: { target_type: 'unknown-x', reason: 'unknown-y' } }));
        expect(text).not.toMatch(/notifications\.|report\.|\{\w+\}/);
      }
    }
  });
});

// ------------------------------------------------------- notifications list --
describe('Notifications screen', () => {
  it('lists notifications, marks them read and opens the post', async () => {
    mockRpcResults = { my_notifications: [note({})] };
    await wrap(<NotificationsScreen />);
    const row = await screen.findByRole('button', { name: 'Ann liked your post' });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('mark_notifications_read', undefined));
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/post/[id]', params: { id: UUID1 } });
  });

  it('shows the empty state', async () => {
    mockRpcResults = { my_notifications: [] };
    await wrap(<NotificationsScreen />);
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });
});

// ------------------------------------------------------------------ report --
describe('Report screen', () => {
  it('refuses to open without a valid target', async () => {
    mockParams = { type: 'banana', id: UUID1 };
    await wrap(<ReportScreen />);
    expect(screen.getByText('This has changed in the meantime. Please go back and try again.')).toBeTruthy();
  });

  it('sends the chosen reason and details', async () => {
    mockParams = { type: 'post', id: UUID1 };
    mockRpcResults = { report_content: 'r1' };
    await wrap(<ReportScreen />);
    await fireEvent.press(screen.getByText('Hate speech'));
    await fireEvent.changeText(screen.getByLabelText('Details (optional)'), '  insults in caption  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('report_content', {
        p_type: 'post',
        p_target: UUID1,
        p_reason: 'hate',
        p_details: 'insults in caption',
      }),
    );
    expect(await screen.findByText(/The PL8 team will review your report/)).toBeTruthy();
  });

  it('shows the daily limit message from the server', async () => {
    mockParams = { type: 'user', id: UUID1 };
    mockRpcResults = { report_content: new Error('PL8_RATE_LIMITED') };
    await wrap(<ReportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(translate('en', 'errors.rate_limited'))).toBeTruthy();
  });
});

// ---------------------------------------------------------- delete account --
describe('Delete account', () => {
  it('needs the password and contacts nobody without it', async () => {
    await wrap(<DeleteAccountScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
    expect(screen.getByText('This field is required.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('stops when the password is wrong', async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const alert = spyAlert();
    await wrap(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Enter your password to confirm'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
    alert.press('Delete account');
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('delete_my_account', undefined);
  });

  it('re-checks the password, deletes files, then the account, then signs out', async () => {
    mockSignIn.mockResolvedValue({ data: { user: { id: 'me' } }, error: null });
    const alert = spyAlert();
    await wrap(<DeleteAccountScreen />);
    await fireEvent.changeText(screen.getByLabelText('Enter your password to confirm'), 'right-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete my account permanently' }));
    alert.press('Delete account');
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'me@example.com', password: 'right-password' });
    expect(mockCalls).toEqual(['remove:me/a.jpg', 'rpc:delete_my_account', 'signOut']);
  });
});

// --------------------------------------------------------------- admin ------
const queueItem: ReportQueueItem = {
  report_id: 'r1',
  target_type: 'post',
  target_id: UUID1,
  reason: 'spam',
  details: 'sells fake parts',
  created_at: new Date().toISOString(),
  reporter_username: 'ben',
  owner_id: 'u-cleo',
  owner_username: 'cleo',
  open_reports: 2,
  preview: { caption: 'Cheap rims, DM me', media_paths: [] },
  snapshot: { caption: 'Cheap rims, DM me', media_paths: [] },
};

describe('Admin reports', () => {
  it('is closed to non-admins', async () => {
    mockRpcResults = { am_i_admin: false };
    await wrap(<ReportsQueueScreen />);
    expect(await screen.findByText(translate('en', 'errors.permission_denied'))).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_reports_queue', undefined);
  });

  it('lists open reports for admins', async () => {
    mockRpcResults = { am_i_admin: true, admin_reports_queue: [queueItem], admin_orphaned_files: [] };
    await wrap(<ReportsQueueScreen />);
    expect(await screen.findByText('Spam or scam')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Spam or scam' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/report/[id]', params: { id: 'r1' } });
  });

  it('needs a note to remove content, and sends the decision', async () => {
    mockParams = { id: 'r1' };
    mockRpcResults = { am_i_admin: true, admin_reports_queue: [queueItem] };
    spyAlert();
    await wrap(<ReportDetailScreen />);
    expect(await screen.findByText('Cheap rims, DM me')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: translate('en', 'moderation.remove') }));
    expect(screen.getByText('Please give a reason (at least 3 characters).')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_resolve_report', expect.anything());

    await fireEvent.changeText(screen.getByLabelText(translate('en', 'moderation.note')), 'Scam offer');
    await fireEvent.press(screen.getByRole('button', { name: translate('en', 'moderation.remove') }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_resolve_report', { p_report: 'r1', p_action: 'remove', p_note: 'Scam offer' }),
    );
  });

  it('asks for confirmation before suspending an account', async () => {
    mockParams = { id: 'r1' };
    mockRpcResults = { am_i_admin: true, admin_reports_queue: [queueItem] };
    const alert = spyAlert();
    await wrap(<ReportDetailScreen />);
    await screen.findByText('Cheap rims, DM me');
    await fireEvent.changeText(screen.getByLabelText(translate('en', 'moderation.note')), 'Repeated scams');
    await fireEvent.press(screen.getByRole('button', { name: translate('en', 'moderation.suspend') }));
    expect(mockRpc).not.toHaveBeenCalledWith('admin_resolve_report', expect.anything());
    alert.press(translate('en', 'moderation.suspend'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_resolve_report', { p_report: 'r1', p_action: 'suspend', p_note: 'Repeated scams' }),
    );
  });
});

// ---------------------------------------------------- crash & offline -------
describe('Crash screen and offline bar', () => {
  it('shows a friendly crash screen with a working retry', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<CrashScreen error={new Error('secret stack detail')} retry={retry} />);
    expect(screen.queryByText(/secret stack detail/)).toBeNull();
    await fireEvent.press(screen.getByRole('button'));
    expect(retry).toHaveBeenCalled();
  });

  it('shows the offline bar only when the phone reports no connection', async () => {
    const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
    const banner = () => (
      <SafeAreaProvider initialMetrics={metrics}>
        <I18nProvider initial="en">
          <OfflineBanner />
        </I18nProvider>
      </SafeAreaProvider>
    );
    mockConnected = null; // not known yet
    const view = await render(banner());
    expect(screen.queryByText(translate('en', 'system.offline'))).toBeNull();
    mockConnected = false;
    await view.rerender(banner());
    expect(screen.getByText(translate('en', 'system.offline'))).toBeTruthy();
    mockConnected = true;
    await view.rerender(banner());
    expect(screen.queryByText(translate('en', 'system.offline'))).toBeNull();
  });
});
