import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deviceLocale, translate } from '@/i18n';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

/**
 * Last-resort screen when a screen crashes. It sits outside the app's
 * providers, so it uses plain components and the device language only.
 * Error details are never shown to the user.
 */
export function CrashScreen({ retry }: ErrorBoundaryProps) {
  const locale = deviceLocale();
  return (
    <View style={styles.root} accessibilityLiveRegion="assertive">
      <Text style={styles.title}>{translate(locale, 'system.crashTitle')}</Text>
      <Text style={styles.body}>{translate(locale, 'system.crashBody')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{translate(locale, 'common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.bgPrimary,
  },
  title: { color: colors.textPrimary, fontSize: 20, fontFamily: fonts.semibold, textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, textAlign: 'center' },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.accentSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontFamily: fonts.semibold },
});
