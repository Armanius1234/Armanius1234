import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import AppealDetailScreen from '@/app/admin/appeal/[id]';
import AppealsQueueScreen from '@/app/admin/appeals';
import ModerationStatsScreen from '@/app/admin/stats';
import AppealScreen from '@/app/settings/appeal';
import DecisionsScreen from '@/app/settings/decisions';
import NotificationsScreen from '@/app/notifications';
import NotificationSettingsScreen from '@/app/settings/notifications';
import SuspendedScreen from '@/app/suspended';
import { AuthContext } from '@/features/auth/AuthProvider';
import { canAppeal, statsToCsv } from '@/features/moderation/appeals';
import { notificationText } from '@/features/notifications/text';
import { I18nProvider, translate, type TKey, type TParams } from '@/i18n';
import type { AppealQueueItem, Decision, ModerationStats, NotificationItem } from '@/lib/database.types';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
const mockRpc = jest.fn((fn: string, _args?: unknown) => {
  const r = mockRpcResults[fn];
  if (r instanceof Error) return Promise.resolve({ data: null, error: { message: r.message, code: 'P0001' } });
  return Promise.resolve({ data: r ?? null, error: null });
});
let mockSettings: Record<string, unknown> = {};
const mockUpdate = jest.fn((patch: Record<string, unknown>) => {
  mockSettings = { ...mockSettings, ...patch };
  return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: mockSettings, error: null }) }) }) };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockSettings, error: null }) }) }),
      update: (patch: Record<string, unknown>) => mockUpdate(patch),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: {},
  },
  avatarUrl: () => null,
}));
jest.mock('@/features/notifications/push', () => ({
  registerForPush: jest.fn(() => Promise.resolve('unavailable')),
  unregisterPush: jest.fn(() => Promise.resolve()),
  pushPermission: jest.fn(() => Promise.resolve('unavailable')),
}));
const mockExport = jest.fn((_title: string) => Promise.resolve());
jest.mock('@/features/account/api', () => ({ exportMyData: (title: string) => mockExport(title) }));

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

const mockSignOut = jest.fn();
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
  signOut: () => mockSignOut(),
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockRpcResults = {};
  mockParams = {};
  mockSettings = {};
});

const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const decision = (over: Partial<Decision>): Decision => ({
  report_id: 'r1',
  role: 'owner',
  target_type: 'post',
  reason: 'harassment',
  action: 'remove',
  note: 'Insults in the caption',
  decided_at: days(-2),
  appeal_until: days(178),
  appeal_id: null,
  appeal_status: null,
  appeal_note: null,
  ...over,
});

// -------------------------------------------------------------- decisions ---
describe('Moderation decisions (users)', () => {
  it('shows what was decided, why, and offers an appeal within 6 months', async () => {
    mockRpcResults = {
      my_decisions: [
        decision({}),
        decision({ report_id: 'r2', role: 'reporter', action: 'dismiss', note: null, reason: 'spam' }),
        decision({ report_id: 'r3', appeal_until: days(-1), decided_at: days(-200) }),
      ],
    };
    await wrap(<DecisionsScreen />);
    expect(await screen.findAllByText('Your post was removed')).toHaveLength(2);
    expect(screen.getByText('Your report about a post: no violation found')).toBeTruthy();
    expect(screen.getAllByText('Note from the PL8 team: “Insults in the caption”')).toHaveLength(2);
    expect(screen.getByText('The time to appeal has ended.')).toBeTruthy();
    const appeals = screen.getAllByRole('button', { name: 'Appeal' });
    expect(appeals).toHaveLength(2);
    await fireEvent.press(appeals[0]!);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/settings/appeal', params: { report: 'r1' } });
  });

  it('shows the appeal result with the answer and further options', async () => {
    mockRpcResults = {
      my_decisions: [decision({ appeal_id: 'a1', appeal_status: 'reversed', appeal_note: 'Context shows a quote' })],
    };
    await wrap(<DecisionsScreen />);
    expect(await screen.findByText('Appeal accepted: the decision was reversed')).toBeTruthy();
    expect(screen.getByText('Answer from the PL8 team: “Context shows a quote”')).toBeTruthy();
    expect(screen.getByText(/out-of-court dispute settlement body/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Appeal' })).toBeNull();
  });

  it('knows when an appeal is still possible', () => {
    expect(canAppeal(decision({}))).toBe(true);
    expect(canAppeal(decision({ appeal_until: days(-1) }))).toBe(false);
    expect(canAppeal(decision({ appeal_id: 'a1' }))).toBe(false);
  });
});

describe('Appeal form', () => {
  it('needs an explanation, then sends it', async () => {
    mockParams = { report: 'r1' };
    mockRpcResults = { my_decisions: [decision({})], submit_appeal: 'a1' };
    await wrap(<AppealScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Send appeal' }));
    expect(screen.getByText('Please explain in at least 10 characters.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('submit_appeal', expect.anything());

    await fireEvent.changeText(screen.getByLabelText('Your explanation'), '  I was quoting a song lyric.  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send appeal' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('submit_appeal', { p_report: 'r1', p_reason: 'I was quoting a song lyric.' }),
    );
    expect(await screen.findByText(/Your appeal was sent/)).toBeTruthy();
  });

  it('shows the server message when the window has closed', async () => {
    mockParams = { report: 'r1' };
    mockRpcResults = { my_decisions: [decision({})], submit_appeal: new Error('PL8_APPEAL_EXPIRED') };
    await wrap(<AppealScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Your explanation'), 'Please look at this again.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send appeal' }));
    expect(await screen.findByText('Appeals are possible for 6 months after a decision. This one is older.')).toBeTruthy();
  });
});

// -------------------------------------------------------------- suspended ---
describe('Suspended account screen', () => {
  it('shows the reason and the appeal, and keeps data rights available', async () => {
    mockRpcResults = { my_decisions: [decision({ action: 'suspend', target_type: 'user', note: 'Repeated insults' })] };
    await wrap(<SuspendedScreen />);
    expect(await screen.findByText('Your account is suspended')).toBeTruthy();
    expect(screen.getByText('Your account was suspended')).toBeTruthy();
    expect(screen.getByText('Note from the PL8 team: “Repeated insults”')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send appeal' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(mockExport).toHaveBeenCalled());
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/delete-account');
    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('shows the appeal status instead of the form once appealed', async () => {
    mockRpcResults = {
      my_decisions: [decision({ action: 'suspend', target_type: 'user', appeal_id: 'a1', appeal_status: 'open' })],
    };
    await wrap(<SuspendedScreen />);
    expect(await screen.findByText('Appeal under review')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send appeal' })).toBeNull();
  });
});

// ---------------------------------------------------------- admin appeals ---
const appeal = (over: Partial<AppealQueueItem>): AppealQueueItem => ({
  appeal_id: 'a1',
  created_at: days(-1),
  appellant_username: 'ann_m7',
  role: 'owner',
  appeal_reason: 'I was quoting someone else.',
  report_id: 'r1',
  target_type: 'post',
  report_reason: 'harassment',
  action: 'remove',
  decision_note: 'Insults in the caption',
  decided_at: days(-2),
  owner_username: 'ann_m7',
  preview: { caption: 'Golden hour', removed: true, media_paths: [] },
  snapshot: { caption: 'Golden hour', removed: false, media_paths: [] },
  restorable: true,
  ...over,
});

describe('Appeals (admins)', () => {
  it('is closed to non-admins', async () => {
    mockRpcResults = { am_i_admin: false };
    await wrap(<AppealsQueueScreen />);
    expect(await screen.findByText('You are not allowed to do that.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_appeals_queue', undefined);
  });

  it('lists open appeals', async () => {
    mockRpcResults = { am_i_admin: true, admin_appeals_queue: [appeal({})] };
    await wrap(<AppealsQueueScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Content removed · Harassment or bullying' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin/appeal/[id]', params: { id: 'a1' } });
  });

  it('needs a reason, says what reversing does, and sends the decision', async () => {
    mockParams = { id: 'a1' };
    mockRpcResults = { am_i_admin: true, admin_appeals_queue: [appeal({})] };
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await wrap(<AppealDetailScreen />);
    expect(await screen.findByText('“I was quoting someone else.”')).toBeTruthy();
    expect(screen.getByText('Reversing makes the content visible again.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Reverse the decision' }));
    expect(screen.getByText('Please give a reason (at least 3 characters).')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalledWith('admin_decide_appeal', expect.anything());

    await fireEvent.changeText(screen.getByLabelText('Reason for your decision (sent to the person)'), 'Quote, allowed');
    await fireEvent.press(screen.getByRole('button', { name: 'Reverse the decision' }));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('admin_decide_appeal', { p_appeal: 'a1', p_outcome: 'reversed', p_note: 'Quote, allowed' }),
    );
  });

  it('warns when deleted content cannot come back', async () => {
    mockParams = { id: 'a1' };
    mockRpcResults = { am_i_admin: true, admin_appeals_queue: [appeal({ target_type: 'comment', restorable: false })] };
    await wrap(<AppealDetailScreen />);
    expect(await screen.findByText(/cannot be brought back/)).toBeTruthy();
  });
});

// -------------------------------------------------------------- statistics --
const stats: ModerationStats = {
  from: '2026-09-29T00:00:00Z',
  to: '2026-10-29T00:00:00Z',
  reports_received: 12,
  reports_by_reason: { spam: 7, harassment: 5 },
  reports_by_target: { post: 9, comment: 3 },
  decisions: { remove: 6, dismiss: 4, suspend: 1 },
  median_hours_to_decision: 5.5,
  appeals_received: 3,
  appeals_upheld: 1,
  appeals_reversed: 1,
  appeals_open: 1,
  accounts_suspended_now: 1,
};

describe('Moderation statistics', () => {
  it('shows the numbers for the period', async () => {
    mockRpcResults = { am_i_admin: true, admin_moderation_stats: stats };
    await wrap(<ModerationStatsScreen />);
    expect(await screen.findByLabelText('Reports received: 12')).toBeTruthy();
    expect(screen.getByLabelText('Content removed: 6')).toBeTruthy();
    expect(screen.getByLabelText('Median time to a decision: 5.5 h')).toBeTruthy();
    expect(screen.getByLabelText('Accepted (decision reversed): 1')).toBeTruthy();
    const call = mockRpc.mock.calls.find(([fn]) => fn === 'admin_moderation_stats');
    const args = call?.[1] as { p_from: string; p_to: string };
    const span = (new Date(args.p_to).getTime() - new Date(args.p_from).getTime()) / 86_400_000;
    expect(span).toBeCloseTo(30, 5);
  });

  it('exports a CSV with one metric per line', () => {
    const csv = statsToCsv(stats);
    expect(csv.split('\n')[0]).toBe('metric,value');
    expect(csv).toContain('reports_received,12\n');
    expect(csv).toContain('reports_reason_spam,7\n');
    expect(csv).toContain('decisions_suspend,1\n');
    expect(csv).toContain('median_hours_to_decision,5.5\n');
  });
});

// -------------------------------------------------- push switches per type --
describe('Push switches per type', () => {
  it('turns one kind off, and greys them out when push is off', async () => {
    mockSettings = { push_enabled: true, push_likes: true, push_comments: true, push_follows: true, push_messages: true };
    await wrap(<NotificationSettingsScreen />);
    const likes = await screen.findByRole('switch', { name: 'Likes' });
    await fireEvent(likes, 'valueChange', false);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ push_likes: false }));
  });

  it('cannot change kinds while push is off', async () => {
    mockSettings = { push_enabled: false, push_likes: true, push_comments: true, push_follows: true, push_messages: true };
    await wrap(<NotificationSettingsScreen />);
    expect(await screen.findByRole('switch', { name: 'Messages' })).toBeDisabled();
  });
});

// ------------------------------------------------------ notification texts --
describe('Texts for the new notifications', () => {
  const note = (over: Partial<NotificationItem>): NotificationItem => ({
    notification_id: 'n1',
    type: 'account_suspended',
    actor_username: null,
    actor_display_name: null,
    actor_avatar_path: null,
    post_id: null,
    vehicle_id: null,
    data: {},
    read: false,
    created_at: new Date().toISOString(),
    ...over,
  });

  it('builds the sentences in both languages', () => {
    const en = (k: TKey, p?: TParams) => translate('en', k, p);
    const de = (k: TKey, p?: TParams) => translate('de', k, p);
    expect(notificationText(en, note({ data: { reason: 'spam' } }))).toBe(
      'Your account was suspended (Spam or scam). Tap to see why and how to appeal.',
    );
    expect(notificationText(en, note({ type: 'appeal_decided', data: { outcome: 'reversed' } }))).toBe(
      'Your appeal was reviewed: the decision was reversed.',
    );
    expect(notificationText(de, note({ type: 'appeal_decided', data: { outcome: 'upheld' } }))).toBe(
      'Dein Einspruch wurde geprüft: die Entscheidung bleibt bestehen.',
    );
  });
});

// ------------------------------------------------- where notifications lead --
describe('Tapping a moderation notification', () => {
  const item = (id: string, type: NotificationItem['type'], data: Record<string, string> = {}): NotificationItem => ({
    notification_id: id,
    type,
    actor_username: null,
    actor_display_name: null,
    actor_avatar_path: null,
    post_id: null,
    vehicle_id: null,
    data,
    read: false,
    created_at: new Date().toISOString(),
  });

  it.each([
    ['account_suspended', { reason: 'spam' }, 'Your account was suspended (Spam or scam). Tap to see why and how to appeal.', '/settings/decisions'],
    ['appeal_decided', { outcome: 'reversed' }, 'Your appeal was reviewed: the decision was reversed.', '/settings/decisions'],
    ['content_removed', { target_type: 'post', reason: 'spam' }, /Your post was removed/, '/settings/decisions'],
    ['report_resolved', { outcome: 'dismissed' }, /Your report was reviewed/, '/settings/decisions'],
    ['report_resolved', { outcome: 'actioned' }, /Your report was reviewed/, '/settings/reports'],
  ] as const)('%s %j opens the right screen', async (type, data, text, target) => {
    mockRpcResults = { my_notifications: [item('n1', type, data)] };
    await wrap(<NotificationsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: text }));
    expect(mockPush).toHaveBeenCalledWith(target);
  });
});

describe('Tapping a mention notification', () => {
  it('opens the post', async () => {
    mockRpcResults = {
      my_notifications: [
        {
          notification_id: 'n1',
          type: 'mention',
          actor_username: 'ann_porsche',
          actor_display_name: 'Ann',
          actor_avatar_path: null,
          post_id: 'p1',
          vehicle_id: null,
          data: { excerpt: 'Hi @me' },
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
    };
    await wrap(<NotificationsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Ann mentioned you: Hi @me' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/post/[id]', params: { id: 'p1' } });
  });
});
