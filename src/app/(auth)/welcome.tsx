import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { env } from '@/lib/env';
import { clearLocalConfig, restartApp } from '@/lib/localConfig';
import { spacing } from '@/theme/tokens';
import { AppText, Button, Logo, Screen } from '@/ui';

export default function WelcomeScreen() {
  const { t } = useI18n();
  return (
    <Screen
      footer={
        <>
          <Button label={t('welcome.register')} onPress={() => router.push('/register')} />
          <Button label={t('welcome.login')} variant="secondary" onPress={() => router.push('/login')} />
          <AppText variant="caption" color="textSecondary" center style={styles.note}>
            {t('welcome.legalNote')}
          </AppText>
          {env.configSource === 'browser' ? <LocalConnection /> : null}
        </>
      }
    >
      <View style={styles.hero}>
        <Logo width={240} />
        <AppText variant="overline" color="textPrimary" center style={styles.tagline}>
          {t('brand.tagline').toUpperCase()}
        </AppText>
        <AppText variant="callout" color="textSecondary" center>
          {t('brand.secondary')}
        </AppText>
      </View>
    </Screen>
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
  local: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  tagline: { marginTop: spacing.lg },
  note: { marginTop: spacing.xs },
});
