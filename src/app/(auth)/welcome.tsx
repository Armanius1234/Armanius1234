import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
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

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  tagline: { marginTop: spacing.lg },
  note: { marginTop: spacing.xs },
});
