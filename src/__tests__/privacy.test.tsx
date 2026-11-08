/**
 * Milestone 10: Settings → Privacy → "Being found".
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import PrivacySettingsScreen from '@/app/settings/privacy';
import { I18nProvider } from '@/i18n';
import { a11yProblems } from '@/test-utils/a11y';

const mockUpdateSettings = jest.fn();
const mockUpdateProfile = jest.fn();
let mockSettings = { messaging_policy: 'everyone', show_in_search: true, show_in_suggestions: true };

jest.mock('@/features/profile/api', () => ({
  useMyProfile: () => ({ isPending: false, isError: false, data: { is_private: false } }),
  useMySettings: () => ({ isPending: false, isError: false, data: mockSettings }),
  useUpdateProfile: () => ({ mutate: mockUpdateProfile, isPending: false, error: null }),
  useUpdateSettings: () => ({ mutate: mockUpdateSettings, isPending: false, error: null }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = { messaging_policy: 'everyone', show_in_search: true, show_in_suggestions: true };
});

function wrap(locale: 'en' | 'de' = 'en') {
  return render(
    <I18nProvider initial={locale}>
      <PrivacySettingsScreen />
    </I18nProvider>,
  );
}

describe('Being found (privacy settings)', () => {
  it('shows both switches, on by default, and explains what they do', async () => {
    const view = await wrap();
    expect(screen.getByText('BEING FOUND')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Show me in people search' }).props.value).toBe(true);
    expect(screen.getByRole('switch', { name: 'Suggest me to others' }).props.value).toBe(true);
    expect(screen.getByText(/an exact @username still reaches you/)).toBeTruthy();
    expect(a11yProblems(view.root!)).toEqual([]);
  });

  it('switching off saves each setting on its own', async () => {
    await wrap();
    await fireEvent(screen.getByRole('switch', { name: 'Show me in people search' }), 'valueChange', false);
    expect(mockUpdateSettings).toHaveBeenLastCalledWith({ show_in_search: false });
    await fireEvent(screen.getByRole('switch', { name: 'Suggest me to others' }), 'valueChange', false);
    expect(mockUpdateSettings).toHaveBeenLastCalledWith({ show_in_suggestions: false });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('shows the saved state and German texts', async () => {
    mockSettings = { ...mockSettings, show_in_search: false };
    await wrap('de');
    expect(screen.getByRole('switch', { name: 'In der Personensuche zeigen' }).props.value).toBe(false);
    expect(screen.getByRole('switch', { name: 'Anderen vorschlagen' }).props.value).toBe(true);
  });

  it('the plate note describes how plate search works today', async () => {
    await wrap();
    expect(screen.getByText(/only be found in PL8 Search after it is verified/)).toBeTruthy();
  });
});
