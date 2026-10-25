// Test environment defaults. No real backend is ever contacted in unit tests.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.invalid';
process.env.EXPO_PUBLIC_SUPABASE_KEY = 'sb_publishable_test_key_for_unit_tests_only';

// Icon fonts are native assets; render a plain stub in tests.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }) => require('react').createElement(Text, null, `icon:${name}`);
  Icon.glyphMap = {};
  return { __esModule: true, default: Icon };
});
