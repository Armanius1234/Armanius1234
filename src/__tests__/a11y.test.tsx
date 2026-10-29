/**
 * Accessibility checks:
 *  - colour contrast of the theme (WCAG AA),
 *  - every tappable element has a role and a name a screen reader can announce,
 *    every text field and switch has a label — on the app's main screens.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';

import AppealsQueueScreen from '@/app/admin/appeals';
import ReportsQueueScreen from '@/app/admin/reports';
import ModerationStatsScreen from '@/app/admin/stats';
import SuspendedUsersScreen from '@/app/admin/suspended';
import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import HomeScreen from '@/app/(tabs)/index';
import MessagesScreen from '@/app/(tabs)/messages';
import PlateSearchScreen from '@/app/(tabs)/search';
import NotificationsScreen from '@/app/notifications';
import EditPostScreen from '@/app/post/edit';
import PostScreen from '@/app/post/[id]';
import ReportScreen from '@/app/report';
import DecisionsScreen from '@/app/settings/decisions';
import DeleteAccountScreen from '@/app/settings/delete-account';
import SettingsScreen from '@/app/settings/index';
import NotificationSettingsScreen from '@/app/settings/notifications';
import SuspendedScreen from '@/app/suspended';
import { AuthContext } from '@/features/auth/AuthProvider';
import { ConsentStep } from '@/features/auth/ConsentStep';
import { I18nProvider } from '@/i18n';
import { colors } from '@/theme/tokens';
import { a11yProblems, contrastRatio } from '@/test-utils/a11y';

// ------------------------------------------------------------------ data ----
const now = new Date().toISOString();
const post = {
  post_id: 'p1',
  author_id: 'u2',
  author_username: 'lena_m',
  author_display_name: 'Lena M.',
  author_avatar_path: null,
  vehicle_id: 'v1',
  vehicle_make: 'BMW',
  vehicle_model: 'M2',
  vehicle_generation: 'G87',
  caption: 'Golden hour',
  media_paths: ['p1/1.jpg', 'p1/2.jpg'],
  like_count: 4,
  comment_count: 1,
  liked: false,
  saved: false,
  published_at: now,
};
const mockRpcData: Record<string, unknown> = {
  am_i_admin: true,
  get_posts: [post],
  get_comments: [
    {
      comment_id: 'c1',
      author_id: 'u3',
      author_username: 'max_r',
      author_display_name: 'Max R.',
      author_avatar_path: null,
      body: 'Clean!',
      created_at: now,
      can_delete: false,
    },
  ],
  my_conversations: [
    {
      conversation_id: 'c1',
      status: 'active',
      is_request_for_me: false,
      other_id: 'u2',
      other_username: 'lena_m',
      other_display_name: 'Lena M.',
      other_avatar_path: null,
      last_message: 'See you Saturday',
      last_message_mine: false,
      last_message_at: now,
      unread_count: 2,
    },
  ],
  my_notifications: [
    {
      notification_id: 'n1',
      type: 'like',
      actor_username: 'lena_m',
      actor_display_name: 'Lena M.',
      actor_avatar_path: null,
      post_id: 'p1',
      vehicle_id: null,
      data: {},
      read: false,
      created_at: now,
    },
  ],
  unread_notification_count: 1,
  my_decisions: [
    {
      report_id: 'r1',
      role: 'owner',
      target_type: 'user',
      reason: 'harassment',
      action: 'suspend',
      note: 'Insults',
      decided_at: now,
      appeal_until: new Date(Date.now() + 1e10).toISOString(),
      appeal_id: null,
      appeal_status: null,
      appeal_note: null,
    },
  ],
  admin_reports_queue: [
    {
      report_id: 'r1',
      target_type: 'post',
      target_id: 'p1',
      reason: 'spam',
      details: '',
      created_at: now,
      reporter_username: 'ben',
      owner_id: 'u2',
      owner_username: 'lena_m',
      open_reports: 2,
      preview: { caption: 'x', media_paths: [] },
      snapshot: null,
    },
  ],
  admin_orphaned_files: [{ bucket: 'post-media', path: 'x/1.jpg' }],
  admin_appeals_queue: [],
  admin_suspended_users: [
    { user_id: 'u9', username: 'spam_bot', display_name: 'Spam Bot', avatar_path: null, suspended_at: now, reason: 'Spam' },
  ],
  admin_moderation_stats: {
    from: now,
    to: now,
    reports_received: 3,
    reports_by_reason: { spam: 3 },
    reports_by_target: { post: 3 },
    decisions: { remove: 1 },
    median_hours_to_decision: 2,
    appeals_received: 0,
    appeals_upheld: 0,
    appeals_reversed: 0,
    appeals_open: 0,
    accounts_suspended_now: 1,
  },
};
const mockSettings = {
  user_id: 'me',
  messaging_policy: 'everyone',
  locale: 'en',
  push_enabled: true,
  push_likes: true,
  push_comments: true,
  push_follows: true,
  push_messages: true,
};
const mockProfile = { id: 'me', username: 'me_m', display_name: 'Me', is_private: false, suspended_at: null };

// ------------------------------------------------------------------ mocks ---
jest.mock('@/lib/supabase', () => {
  const rows = (table: string): unknown[] =>
    table === 'user_settings' ? [mockSettings] : table === 'profiles' ? [mockProfile] : [];
  const chain = (table: string): Record<string, unknown> => {
    const result = { data: rows(table), error: null };
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'order', 'lt', 'gt', 'limit', 'range', 'update', 'insert', 'delete', 'is']) {
      c[m] = () => c;
    }
    c.maybeSingle = () => Promise.resolve({ data: rows(table)[0] ?? null, error: null });
    c.single = c.maybeSingle;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return c;
  };
  return {
    supabase: {
      rpc: (fn: string) => Promise.resolve({ data: mockRpcData[fn] ?? null, error: null }),
      from: (table: string) => chain(table),
      storage: {
        from: () => ({
          createSignedUrls: (paths: string[]) =>
            Promise.resolve({ data: paths.map((path) => ({ path, signedUrl: `https://x.invalid/${path}` })), error: null }),
        }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => Promise.resolve(),
      auth: {},
    },
    avatarUrl: () => null,
  };
});
jest.mock('@/features/notifications/push', () => ({
  registerForPush: jest.fn(() => Promise.resolve('unavailable')),
  unregisterPush: jest.fn(() => Promise.resolve()),
  pushPermission: jest.fn(() => Promise.resolve('undetermined')),
}));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({ id: 'p1', report: 'r1', type: 'post' }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
    Stack: { Screen: () => null },
    Link: ({ children }: { children: ReactNode }) => children,
  };
});

const auth = {
  session: { user: { id: 'me', email: 'me@example.com', app_metadata: { provider: 'email' } } } as never,
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

async function renderScreen(Screen: ComponentType) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider initial="en">
        <AuthContext.Provider value={auth}>
          <Screen />
        </AuthContext.Provider>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// ------------------------------------------------------------- contrast -----
describe('Colour contrast (WCAG AA)', () => {
  const backgrounds = ['bgPrimary', 'bgSecondary'] as const;

  it('text colours are readable on the app backgrounds (4.5:1)', () => {
    for (const bg of backgrounds) {
      for (const fg of ['textPrimary', 'textSecondary', 'success', 'warning', 'danger', 'accent'] as const) {
        expect([fg, bg, contrastRatio(colors[fg], colors[bg]) >= 4.5]).toEqual([fg, bg, true]);
      }
    }
  });

  it('white text on filled buttons and badges is readable (4.5:1)', () => {
    expect(contrastRatio('#FFFFFF', colors.accentSolid)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', colors.dangerSolid)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', colors.accentPressed)).toBeGreaterThanOrEqual(4.5);
  });

  it('icons and outlines in the brand blue stand out (3:1)', () => {
    for (const bg of ['bgPrimary', 'bgSecondary', 'bgElevated'] as const) {
      expect(contrastRatio(colors.accent, colors[bg])).toBeGreaterThanOrEqual(3);
    }
  });
});

// -------------------------------------------------------- names and roles ---
const SCREENS: [string, ComponentType, string | RegExp][] = [
  ['Welcome', WelcomeScreen, 'Create account'],
  ['Login', LoginScreen, 'Welcome back'],
  ['Register', RegisterScreen, 'Create your account'],
  ['Consent step', ConsentStep, 'One more step'],
  ['Home feed', HomeScreen, /Golden hour/],
  ['Post with comments', PostScreen, /Clean!/],
  ['Edit caption', EditPostScreen, 'Caption'],
  ['Plate search', PlateSearchScreen, 'District'],
  ['Messages', MessagesScreen, 'See you Saturday'],
  ['Notifications', NotificationsScreen, 'Lena M. liked your post'],
  ['Report', ReportScreen, 'Why are you reporting this?'],
  ['Settings', SettingsScreen, 'Notifications'],
  ['Notification settings', NotificationSettingsScreen, 'Likes'],
  ['Moderation decisions', DecisionsScreen, 'Your account was suspended'],
  ['Delete account', DeleteAccountScreen, 'Delete account'],
  ['Suspended account', SuspendedScreen, 'Your account is suspended'],
  ['Admin: reports', ReportsQueueScreen, 'Spam or scam'],
  ['Admin: appeals', AppealsQueueScreen, 'No open appeals.'],
  ['Admin: suspended accounts', SuspendedUsersScreen, 'Spam Bot'],
  ['Admin: statistics', ModerationStatsScreen, 'Reports received: 3'],
];

describe('Screen reader names and roles', () => {
  it.each(SCREENS)('%s', async (_name, Screen, ready) => {
    const view = await renderScreen(Screen);
    await waitFor(() => expect(screen.queryAllByText(ready).length + screen.queryAllByLabelText(ready).length).toBeGreaterThan(0));
    expect(a11yProblems(view.root!)).toEqual([]);
  });
});
