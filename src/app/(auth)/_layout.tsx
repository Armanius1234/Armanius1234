import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export const unstable_settings = { initialRouteName: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        title: '',
        headerTintColor: colors.textPrimary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bgPrimary },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="legal" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
