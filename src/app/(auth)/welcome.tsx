import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n, type TKey } from '@/i18n';
import { env } from '@/lib/env';
import { clearLocalConfig, restartApp } from '@/lib/localConfig';
import { colors, fonts, spacing } from '@/theme/tokens';
import { AppText, Button, Logo } from '@/ui';
import { HeroBackground } from '@/ui/Hero';

const FEATURES: { icon: ComponentProps<typeof Ionicons>['name']; label: TKey }[] = [
  { icon: 'people-outline', label: 'brand.featureConnect' },
  { icon: 'car-sport-outline', label: 'brand.featureDiscover' },
  { icon: 'location-outline', label: 'brand.featureCommunity' },
];

export default function WelcomeScreen() {
  const { t } = useI18n();
  return (
    <View style={styles.root}>
      <HeroBackground />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          <Logo width={250} frame="pill" />
          <AppText center style={styles.tagline}>
            {t('brand.tagline').toUpperCase()}
          </AppText>
        </View>

        <View style={styles.bottom}>
          <Button label={t('welcome.register')} onPress={() => router.push('/register')} />
          <Button label={t('welcome.login')} variant="secondary" onPress={() => router.push('/login')} />
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.feature}>
                <Ionicons name={f.icon} size={22} color={colors.textPrimary} />
                <AppText variant="caption" center style={styles.featureText}>
                  {t(f.label).toUpperCase()}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color="textSecondary" center>
            {t('welcome.legalNote')}
          </AppText>
          {env.configSource === 'browser' ? <LocalConnection /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** Web version on localhost, connected through the local setup form: show where to, and allow changing it. */
function LocalConnection() {
  const { t } = useI18n();
  const host = env.supabaseUrl.replace(/^https:\/\//, '');
  return (
    <View style={styles.local}>
      <AppText variant="caption" color="textSecondary">
        {t('local.connectedTo', { host })}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('local.change')}
        onPress={() => {
          clearLocalConfig();
          restartApp();
        }}
      >
        <AppText variant="caption" color="accent">
          {t('local.change')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  safe: { flex: 1, paddingHorizontal: spacing.md },
  hero: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md },
  tagline: { fontFamily: fonts.medium, fontSize: 13, letterSpacing: 4, lineHeight: 20, color: colors.textPrimary },
  bottom: { flex: 1, justifyContent: 'flex-end', gap: spacing.sm, paddingBottom: spacing.md },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  feature: { flex: 1, alignItems: 'center', gap: spacing.xxs },
  featureText: { fontSize: 10, letterSpacing: 2, color: colors.textPrimary },
  local: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
});
