import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import PlateSearchScreen from '@/app/(tabs)/search';
import { cleanQuery, completeMention, mentionInProgress, splitMentions } from '@/features/discovery/api';
import { CarSearchPanel, PeopleSearchPanel, SuggestedPeople } from '@/features/discovery/components';
import { MentionSuggestions, MentionText } from '@/features/discovery/mentions';
import { AuthContext } from '@/features/auth/AuthProvider';
import { pushHref } from '@/features/notifications/push';
import { notificationText } from '@/features/notifications/text';
import { I18nProvider, translate, type TKey, type TParams } from '@/i18n';
import type { PersonResult, Suggestion, VehicleResult } from '@/lib/database.types';
import { a11yProblems } from '@/test-utils/a11y';
import { AppText } from '@/ui';

// ------------------------------------------------------------------ mocks ---
let mockRpcResults: Record<string, unknown> = {};
const mockRpc = jest.fn((fn: string, _args?: unknown) =>
  Promise.resolve({ data: mockRpcResults[fn] ?? null, error: null }),
);
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    storage: {
      from: () => ({
        createSignedUrls: (paths: string[]) =>
          Promise.resolve({ data: paths.map((path) => ({ path, signedUrl: `https://x.invalid/${path}` })), error: null }),
      }),
    },
    auth: {},
  },
  avatarUrl: () => null,
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  AndroidImportance: { HIGH: 4 },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockRpcResults = {};
});

const mia: PersonResult = {
  user_id: 'u-mia',
  username: 'mia_maier',
  display_name: 'Mia Maier',
  avatar_path: null,
  is_private: false,
  follower_count: 12,
  i_follow: true,
};
const cleo: PersonResult = { ...mia, user_id: 'u-cleo', username: 'cleo_m', display_name: 'Cleo Maier', is_private: true, i_follow: false };

// ------------------------------------------------------------- text helpers --
describe('Mention and search helpers', () => {
  it('cleans what is searched', () => {
    expect(cleanQuery('  @@Mia_Maier ')).toBe('mia_maier');
  });

  it('knows which name is being typed, and completes it', () => {
    expect(mentionInProgress('Nice shot @mi')).toBe('mi');
    expect(mentionInProgress('Nice shot @')).toBe('');
    expect(mentionInProgress('mail me@mia')).toBeNull();
    expect(mentionInProgress('@mia_maier done')).toBeNull();
    expect(completeMention('Nice shot @mi', 'mia_maier')).toBe('Nice shot @mia_maier ');
  });

  it('splits text into plain parts and @mentions', () => {
    expect(splitMentions('Hi @Mia_Maier, see you. me@mia.de @x')).toEqual([
      { text: 'Hi ' },
      { text: '@Mia_Maier', mention: 'mia_maier' },
      { text: ', see you. me@mia.de @x' },
    ]);
    expect(splitMentions('@ben.bmw.')).toEqual([{ text: '@ben.bmw', mention: 'ben.bmw' }, { text: '.' }]);
  });
});

// ----------------------------------------------------------- people search --
describe('People search', () => {
  it('waits for 2 letters, then searches and opens the profile', async () => {
    mockRpcResults = { search_people: [mia, cleo] };
    await wrap(<PeopleSearchPanel />);
    await fireEvent.changeText(screen.getByLabelText('Name or @username'), 'm');
    expect(screen.getByText('Type at least 2 letters.')).toBeTruthy();
    await act(() => new Promise((r) => setTimeout(r, 400))); // longer than the typing pause
    expect(mockRpc).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Name or @username'), '@Mai');
    expect(await screen.findByText('Mia Maier')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('search_people', { p_query: 'mai', p_limit: 20 });
    expect(screen.getByText('@mia_maier · Following')).toBeTruthy();
    expect(screen.getByText('@cleo_m · Private account')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Mia Maier, @mia_maier' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/user/[username]', params: { username: 'mia_maier' } });
  });

  it('says when nobody is found', async () => {
    mockRpcResults = { search_people: [] };
    await wrap(<PeopleSearchPanel />);
    await fireEvent.changeText(screen.getByLabelText('Name or @username'), 'zz');
    expect(await screen.findByText('Nobody found')).toBeTruthy();
  });
});

// -------------------------------------------------------------- car search --
const gt3: VehicleResult = {
  vehicle_id: 'v1',
  make: 'Porsche',
  model: '911 GT3',
  generation: '992',
  model_year: 2023,
  is_verified: true,
  cover_path: 'v1/cover.jpg',
  owner_username: 'ann_porsche',
  owner_display_name: 'Ann',
};

describe('Car search', () => {
  it('finds cars by make and model, shows the owner, opens the car', async () => {
    mockRpcResults = { search_vehicles: [gt3] };
    const view = await wrap(<CarSearchPanel />);
    await fireEvent.changeText(screen.getByLabelText('Make, model or generation'), 'Porsche 911');
    expect(await screen.findByText('by @ann_porsche')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('search_vehicles', { p_query: 'porsche 911' });
    expect(a11yProblems(view.root!)).toEqual([]);
    await fireEvent.press(screen.getByRole('button', { name: /Porsche 911 GT3/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vehicle/[id]', params: { id: 'v1' } });
  });
});

describe('Search tab', () => {
  it('starts with plate search and switches to people and cars', async () => {
    await wrap(<PlateSearchScreen />);
    expect(screen.getByLabelText('District')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'People' }));
    expect(screen.getByLabelText('Name or @username')).toBeTruthy();
    expect(screen.queryByLabelText('District')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Cars' }));
    expect(screen.getByLabelText('Make, model or generation')).toBeTruthy();
  });
});

// -------------------------------------------------------------- suggestions --
const suggestion = (over: Partial<Suggestion>): Suggestion => ({
  user_id: 'u1',
  username: 'mia_maier',
  display_name: 'Mia Maier',
  avatar_path: null,
  is_private: false,
  reason: 'followed_by',
  mutual_count: 3,
  mutual_example: 'ben.bmw',
  shared_make: null,
  ...over,
});

describe('Suggested people', () => {
  it('shows why someone is suggested, with a follow button', async () => {
    mockRpcResults = {
      suggested_people: [
        suggestion({}),
        suggestion({ user_id: 'u2', username: 'dirk_drift', display_name: 'Dirk', reason: 'same_make', mutual_count: 0, mutual_example: null, shared_make: 'Porsche' }),
        suggestion({ user_id: 'u3', username: 'pop', display_name: 'Pop', reason: 'popular', mutual_count: 0, mutual_example: null }),
      ],
      relationship: [{ following: false, requested: false, follows_me: false, requested_me: false }],
    };
    const view = await wrap(<SuggestedPeople />);
    expect(await screen.findByText('Followed by @ben.bmw and 2 more')).toBeTruthy();
    expect(screen.getByText('Also drives a Porsche')).toBeTruthy();
    expect(screen.getByText('Popular on PL8')).toBeTruthy();
    expect((await screen.findAllByRole('button', { name: 'Follow' })).length).toBe(3);
    expect(a11yProblems(view.root!)).toEqual([]);
  });

  it('is hidden when there is nobody to suggest', async () => {
    mockRpcResults = { suggested_people: [] };
    await wrap(<SuggestedPeople />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('suggested_people', { p_limit: 10 }));
    expect(screen.queryByText('Suggested for you'.toUpperCase())).toBeNull();
  });
});

// ----------------------------------------------------------------- mentions --
describe('Mentions', () => {
  it('makes @names tappable links', async () => {
    // Used inside a text (caption, comment), like in the app.
    const view = await wrap(
      <AppText>
        <MentionText text="Track day with @mia_maier!" />
      </AppText>,
    );
    await fireEvent.press(screen.getByRole('link', { name: '@mia_maier' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/user/[username]', params: { username: 'mia_maier' } });
    expect(a11yProblems(view.root!)).toEqual([]);
  });

  it('suggests people while typing a name, and fills it in', async () => {
    mockRpcResults = { search_people: [mia] };
    const onPick = jest.fn();
    await wrap(<MentionSuggestions text="Great shot @mi" onPick={onPick} />);
    await fireEvent.press(await screen.findByRole('button', { name: '@mia_maier' }));
    expect(onPick).toHaveBeenCalledWith('Great shot @mia_maier ');
    expect(mockRpc).toHaveBeenCalledWith('search_people', { p_query: 'mi', p_limit: 5 });
  });

  it('suggests nothing until 2 letters are typed', async () => {
    await wrap(<MentionSuggestions text="Great shot @m" onPick={jest.fn()} />);
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('the notification says who mentioned you and where', () => {
    const t = (k: TKey, p?: TParams) => translate('en', k, p);
    const de = (k: TKey, p?: TParams) => translate('de', k, p);
    const n = {
      notification_id: 'n1',
      type: 'mention' as const,
      actor_username: 'ann_porsche',
      actor_display_name: 'Ann',
      actor_avatar_path: null,
      post_id: 'p1',
      vehicle_id: null,
      data: { excerpt: 'Track day with @mia_maier' },
      read: false,
      created_at: new Date().toISOString(),
    };
    expect(notificationText(t, n)).toBe('Ann mentioned you: Track day with @mia_maier');
    expect(notificationText(de, n)).toBe('Ann hat dich erwähnt: Track day with @mia_maier');
  });

  it('a tapped mention push opens the post', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(pushHref({ type: 'mention', post_id: id })).toEqual({ pathname: '/post/[id]', params: { id } });
  });
});
