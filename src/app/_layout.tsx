import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Orbitron_900Black } from '@expo-google-fonts/orbitron/900Black';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile, useMySettings } from '@/features/profile/api';
import { CrashScreen } from '@/features/system/CrashScreen';
import { OfflineBanner } from '@/features/system/OfflineBanner';
import { I18nProvider, useI18n } from '@/i18n';
import { env } from '@/lib/env';
import { colors, fonts } from '@/theme/tokens';
import { ErrorView, LoadingView } from '@/ui';

void SplashScreen.preventAutoHideAsync();

// Catches crashes in any screen so the app shows a retry screen instead of closing.
export const ErrorBoundary = CrashScreen;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

// Refetch stale data when the app returns to the foreground (React Native has
// no window focus events).
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bgPrimary,
    card: colors.bgPrimary,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Orbitron_900Black,
  });

  // Keep the splash screen until fonts are ready (or failed: then system fonts are used).
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AuthProvider>
            <ThemeProvider value={navTheme}>
              <StatusBar style="light" />
              <RootNavigator />
              <OfflineBanner />
            </ThemeProvider>
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { t, setLocale } = useI18n();
  const { session, initializing, resetting } = useAuth();
  const signedIn = !!session && !resetting;
  const profile = useMyProfile();
  const settings = useMySettings();

  // The saved language wins over the device language once the profile exists.
  // (During sign-up the device language is used; it is saved along the way.)
  const savedLocale = profile.data ? settings.data?.locale : undefined;
  useEffect(() => {
    if (savedLocale) setLocale(savedLocale);
  }, [savedLocale, setLocale]);

  // Signed out: drop all cached data of the previous account.
  useEffect(() => {
    if (!session) queryClient.clear();
  }, [session]);

  const waitingForProfile = signedIn && profile.isPending;
  const ready = !initializing && !waitingForProfile;

  useEffect(() => {
    if (ready || !env.isConfigured) void SplashScreen.hideAsync();
  }, [ready]);

  if (!env.isConfigured) {
    return <ErrorView title={t('states.setupTitle')} message={t('states.setupBody')} />;
  }
  if (!ready) return <LoadingView />;
  if (signedIn && profile.isError) {
    return <ErrorView onRetry={() => void profile.refetch()} retrying={profile.isFetching} />;
  }

  const hasProfile = !!profile.data;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: fonts.semibold },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      {/* Return address for Apple / Google sign-in; open in every state. */}
      <Stack.Screen name="auth/callback" />

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && hasProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile/edit" options={{ headerShown: true, title: t('profile.editTitle') }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="user/[username]/index" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="user/[username]/followers" options={{ headerShown: true, title: t('social.followers') }} />
        <Stack.Screen name="user/[username]/following" options={{ headerShown: true, title: t('social.followingTitle') }} />
        <Stack.Screen name="follow-requests" options={{ headerShown: true, title: t('social.requestsTitle') }} />
        <Stack.Screen name="post/new" options={{ headerShown: true, title: t('post.newTitle') }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: true, title: t('post.title') }} />
        <Stack.Screen name="saved" options={{ headerShown: true, title: t('post.savedTitle') }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="vehicle/new" options={{ headerShown: true, title: t('vehicle.newTitle') }} />
        <Stack.Screen name="vehicle/[id]/index" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="vehicle/[id]/edit" options={{ headerShown: true, title: t('vehicle.editTitle') }} />
        <Stack.Screen name="vehicle/[id]/plate" options={{ headerShown: true, title: t('plate.title') }} />
        <Stack.Screen
          name="verification/[claimId]"
          options={{ headerShown: true, title: t('verification.title') }}
        />
        <Stack.Screen name="admin/index" options={{ headerShown: true, title: t('admin.title') }} />
        <Stack.Screen name="admin/[requestId]" options={{ headerShown: true, title: t('admin.title') }} />
        <Stack.Screen name="admin/reports" options={{ headerShown: true, title: t('moderation.title') }} />
        <Stack.Screen name="admin/report/[id]" options={{ headerShown: true, title: t('moderation.title') }} />
        <Stack.Screen name="admin/suspended" options={{ headerShown: true, title: t('moderation.suspendedTitle') }} />
        <Stack.Screen name="post/edit" options={{ headerShown: true, title: t('post.editTitle') }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title') }} />
        <Stack.Screen
          name="report"
          options={{ headerShown: true, title: t('report.title'), presentation: 'modal' }}
        />
      </Stack.Protected>
    </Stack>
  );
}
