import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage } from '@/ui';

import { availableProviders, signInWithProvider, type SocialProvider } from './social';

/**
 * "Continue with Apple / Google". Hidden until the providers are switched on
 * (EXPO_PUBLIC_AUTH_APPLE / EXPO_PUBLIC_AUTH_GOOGLE). After sign-in the app
 * moves on by itself (new accounts go to the consent + profile steps).
 */
export function SocialButtons({ providers = availableProviders() }: { providers?: SocialProvider[] }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!providers.length) return null;

  const run = async (provider: SocialProvider) => {
    setError(null);
    setBusy(provider);
    try {
      await signInWithProvider(provider);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      {providers.includes('apple') && Platform.OS === 'ios' ? (
        // Apple's own button, as Apple's design rules require.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={radius.md}
          style={styles.apple}
          onPress={() => void run('apple')}
        />
      ) : null}
      {providers.includes('google') ? (
        <Button
          label={t('auth.continueGoogle')}
          variant="secondary"
          icon={<Ionicons name="logo-google" size={18} color={colors.textPrimary} />}
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={() => void run('google')}
        />
      ) : null}
      <FormMessage message={error} />
      <AppText variant="caption" color="textSecondary" center>
        {t('auth.socialNote')}
      </AppText>
      <View style={styles.orRow}>
        <View style={styles.line} />
        <AppText variant="caption" color="textSecondary">
          {t('auth.or')}
        </AppText>
        <View style={styles.line} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  apple: { height: 48, width: '100%' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
