import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import PlateSearchScreen from '@/app/(tabs)/search';
import { AuthContext } from '@/features/auth/AuthProvider';
import { PlateBadge, PlateInput } from '@/features/garage/components';
import { I18nProvider } from '@/i18n';
import { EMPTY_PLATE, type PlateParts } from '@/shared/plate';

const mockRpc = jest.fn();
const mockSigned = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: jest.fn(),
    storage: { from: () => ({ createSignedUrls: (...a: unknown[]) => mockSigned(...a) }) },
    auth: {},
  },
  avatarUrl: () => null,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn() },
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

async function typePlate(d: string, l: string, n: string) {
  await fireEvent.changeText(screen.getByLabelText('District'), d);
  await fireEvent.changeText(screen.getByLabelText('Letters'), l);
  await fireEvent.changeText(screen.getByLabelText('Numbers'), n);
}

beforeEach(() => {
  mockRpc.mockReset();
  mockSigned.mockReset();
  mockPush.mockReset();
  mockSigned.mockResolvedValue({ data: [], error: null });
});

describe('PlateInput', () => {
  function Harness({ onValue }: { onValue: (p: PlateParts) => void }) {
    const [v, setV] = useState<PlateParts>(EMPTY_PLATE);
    return (
      <PlateInput
        value={v}
        onChange={(n) => {
          setV(n);
          onValue(n);
        }}
      />
    );
  }

  it('filters what can be typed into each part', async () => {
    const onValue = jest.fn();
    await wrap(<Harness onValue={onValue} />);
    await typePlate('wi-1', 'fä', '0480');
    expect(onValue).toHaveBeenLastCalledWith({ district: 'WI', letters: 'F', digits: '480', suffix: '' });
  });

  it('selects the E/H suffix', async () => {
    const onValue = jest.fn();
    await wrap(<Harness onValue={onValue} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'E · electric' }));
    expect(onValue).toHaveBeenLastCalledWith({ ...EMPTY_PLATE, suffix: 'E' });
  });

  it('shows plates the way they look on the car', async () => {
    await wrap(<PlateBadge plate="WI-FA-480" />);
    expect(screen.getByText('WI-FA 480')).toBeTruthy();
  });
});

describe('PL8 Search screen', () => {
  it('does not call the server for an invalid plate', async () => {
    await wrap(<PlateSearchScreen />);
    await typePlate('WI', 'FA', '');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Numbers: 1–9999, no leading zero.')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejects a district code that does not exist, without searching', async () => {
    await wrap(<PlateSearchScreen />);
    await typePlate('ffm', 'ab', '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(
      await screen.findByText('This district code does not exist in Germany. Check the letters before the first hyphen.'),
    ).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('searches with the plate parts and shows the car, hiding the owner by default', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          vehicle_id: 'v1',
          make: 'BMW',
          model: 'M2',
          generation: 'G87',
          model_year: 2024,
          color: 'Brooklyn Grey',
          cover_path: null,
          owner_username: null,
          owner_display_name: null,
          owner_avatar_path: null,
        },
      ],
      error: null,
    });
    await wrap(<PlateSearchScreen />);
    await typePlate('wi', 'fa', '480');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('BMW M2 G87')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('search_plate', {
      p_country: 'DE',
      p_district: 'WI',
      p_letters: 'FA',
      p_digits: '480',
      p_suffix: '',
    });
    expect(screen.getByText('The owner prefers to stay anonymous.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'View car' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vehicle/[id]', params: { id: 'v1' } });
  });

  it('shows the owner only when the result includes them', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          vehicle_id: null,
          make: 'Porsche',
          model: '911',
          generation: null,
          model_year: 2022,
          color: null,
          cover_path: null,
          owner_username: 'alice_m2',
          owner_display_name: 'Alice',
          owner_avatar_path: null,
        },
      ],
      error: null,
    });
    await wrap(<PlateSearchScreen />);
    await typePlate('F', 'AB', '911');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('@alice_m2')).toBeTruthy();
    // No vehicle link: the owner's garage is private.
    expect(screen.queryByRole('button', { name: 'View car' })).toBeNull();
    expect(screen.getByText('The owner’s garage is private.')).toBeTruthy();
  });

  it('shows the same "not found" for unknown and hidden plates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await wrap(<PlateSearchScreen />);
    await typePlate('F', 'AB', '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No PL8 found')).toBeTruthy();
  });

  it('explains the rate limit', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'PL8_RATE_LIMITED' } });
    await wrap(<PlateSearchScreen />);
    await typePlate('F', 'AB', '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Search limit reached')).toBeTruthy();
  });

  it('shows a readable error when offline', async () => {
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    await wrap(<PlateSearchScreen />);
    await typePlate('F', 'AB', '1');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('No connection. Check your internet and try again.')).toBeTruthy());
  });
});
