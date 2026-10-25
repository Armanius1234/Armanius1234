import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import NewPostScreen from '@/app/post/new';
import { AuthContext } from '@/features/auth/AuthProvider';
import { FollowButton, PostCard, ProfileStats } from '@/features/social/components';
import { I18nProvider } from '@/i18n';
import type { FeedPost, Profile } from '@/lib/database.types';
import { compactCount, timeAgo } from '@/shared/time';

// ------------------------------------------------------------ supabase mock --
const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockDeleteEq = jest.fn();
jest.mock('@/lib/supabase', () => {
  const chain = () => ({
    eq: () => ({ eq: (...a: unknown[]) => mockDeleteEq(...a) }),
  });
  return {
    supabase: {
      rpc: (...a: unknown[]) => mockRpc(...a),
      from: () => ({
        insert: (...a: unknown[]) => mockInsert(...a),
        delete: chain,
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      }),
      storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
      auth: {},
    },
    avatarUrl: () => null,
  };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  Link: ({ children }: { children: ReactNode }) => children,
  useLocalSearchParams: () => ({}),
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

const profile: Profile = {
  id: 'ann',
  username: 'ann_m2',
  display_name: 'Ann',
  bio: '',
  avatar_path: null,
  city: null,
  instagram_url: null,
  tiktok_url: null,
  linkedin_url: null,
  facebook_url: null,
  is_private: false,
  follower_count: 1234,
  following_count: 56,
  post_count: 7,
  suspended_at: null,
  created_at: '',
  updated_at: '',
};

const post: FeedPost = {
  post_id: 'p1',
  author_id: 'ann',
  author_username: 'ann_m2',
  author_display_name: 'Ann',
  author_avatar_path: null,
  vehicle_id: 'v1',
  vehicle_make: 'BMW',
  vehicle_model: 'M2',
  vehicle_generation: 'G87',
  caption: 'New wheels',
  media_paths: ['p1/a.jpg'],
  like_count: 4,
  comment_count: 2,
  liked: false,
  saved: false,
  published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  mockRpc.mockReset();
  mockInsert.mockReset();
  mockDeleteEq.mockReset();
});

// ------------------------------------------------------------------ pure ----
describe('time and counts', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  it('formats relative times', () => {
    expect(timeAgo('2026-10-27T11:59:30Z', now)).toEqual({ unit: 'now' });
    expect(timeAgo('2026-10-27T11:15:00Z', now)).toEqual({ unit: 'minutes', n: 45 });
    expect(timeAgo('2026-10-27T03:00:00Z', now)).toEqual({ unit: 'hours', n: 9 });
    expect(timeAgo('2026-10-24T12:00:00Z', now)).toEqual({ unit: 'days', n: 3 });
    expect(timeAgo('2026-09-01T12:00:00Z', now).unit).toBe('date');
  });
  it('shortens big numbers', () => {
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1234)).toBe('1.2K');
    expect(compactCount(2000)).toBe('2K');
    expect(compactCount(3_450_000)).toBe('3.4M');
  });
});

/**
 * The follow button shows its label while the relationship is still loading,
 * but ignores presses until then. Wait until it is ready, as a person would.
 */
async function findEnabledButton(name: string) {
  return waitFor(() => {
    const button = screen.getByRole('button', { name });
    expect(button).toBeEnabled();
    return button;
  });
}

// ---------------------------------------------------------------- follow ----
describe('FollowButton', () => {
  it('follows a public account', async () => {
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === 'relationship'
          ? { data: [{ following: false, requested: false, follows_me: false, requested_me: false }], error: null }
          : { data: 'following', error: null },
      ),
    );
    await wrap(<FollowButton profile={profile} />);
    await fireEvent.press(await findEnabledButton('Follow'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('follow_user', { p_target: 'ann' }));
  });

  it('offers "Follow back" when they follow you', async () => {
    mockRpc.mockResolvedValue({
      data: [{ following: false, requested: false, follows_me: true, requested_me: false }],
      error: null,
    });
    await wrap(<FollowButton profile={profile} />);
    expect(await screen.findByRole('button', { name: 'Follow back' })).toBeTruthy();
  });

  it('shows "Requested" for a pending request and asks before withdrawing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRpc.mockResolvedValue({
      data: [{ following: false, requested: true, follows_me: false, requested_me: false }],
      error: null,
    });
    await wrap(<FollowButton profile={{ ...profile, is_private: true }} />);
    await fireEvent.press(await findEnabledButton('Requested'));
    expect(alert).toHaveBeenCalledWith('Withdraw your follow request?', undefined, expect.any(Array));
    expect(mockRpc).not.toHaveBeenCalledWith('unfollow_user', expect.anything());
    alert.mockRestore();
  });
});

describe('ProfileStats', () => {
  it('shows compact counts', async () => {
    await wrap(<ProfileStats profile={profile} canOpenLists />);
    expect(screen.getByText('1.2K')).toBeTruthy();
    expect(screen.getByText('56')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });
});

// ------------------------------------------------------------------ posts ---
describe('PostCard', () => {
  it('shows author, car, caption and time', async () => {
    await wrap(<PostCard post={post} />);
    expect(screen.getByText('Ann')).toBeTruthy();
    expect(screen.getByText('BMW M2 G87')).toBeTruthy();
    expect(screen.getByText(/New wheels/)).toBeTruthy();
    expect(screen.getByText('5 min')).toBeTruthy();
  });

  it('likes instantly and sends the like', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await wrap(<PostCard post={post} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Like' }));
    expect(screen.getByText('5')).toBeTruthy();
    await waitFor(() => expect(mockInsert).toHaveBeenCalledWith({ user_id: 'me', post_id: 'p1' }));
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy();
  });

  it('rolls the like back when the server refuses', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    await wrap(<PostCard post={post} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Like' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toBeTruthy());
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('offers only "Report" on other people\'s posts', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await wrap(<PostCard post={post} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Options' }));
    const labels = (alert.mock.calls[0]?.[2] ?? []).map((b) => b.text);
    expect(labels).toEqual(['Report post', 'Cancel']);
    alert.mockRestore();
  });

  it('offers "Edit" and "Delete" (not "Report") on your own posts', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await wrap(<PostCard post={{ ...post, author_id: 'me' }} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Options' }));
    const labels = (alert.mock.calls[0]?.[2] ?? []).map((b) => b.text);
    expect(labels).toEqual(['Edit caption', 'Delete post', 'Cancel']);
    alert.mockRestore();
  });
});

describe('New post screen', () => {
  it('cannot be shared without a photo and never contacts the server', async () => {
    await wrap(<NewPostScreen />);
    const share = screen.getByRole('button', { name: 'Share' });
    expect(share.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(share);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
