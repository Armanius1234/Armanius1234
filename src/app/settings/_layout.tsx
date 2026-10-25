import { Stack } from 'expo-router';

import { useI18n } from '@/i18n';
import { colors, fonts } from '@/theme/tokens';

export default function SettingsLayout() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: fonts.semibold },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('settings.title') }} />
      <Stack.Screen name="privacy" options={{ title: t('settings.privacy') }} />
      <Stack.Screen name="blocked" options={{ title: t('privacy.blockedUsers') }} />
      <Stack.Screen name="language" options={{ title: t('settings.language') }} />
      <Stack.Screen name="legal" options={{ title: t('settings.legal') }} />
    </Stack>
  );
}
