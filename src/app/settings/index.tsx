import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Divider, ListRow, Screen, Section } from '@/ui';

export default function SettingsScreen() {
  const { t, locale } = useI18n();
  const { session, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert(t('settings.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: () => {
          signOut().catch((e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e))));
        },
      },
    ]);
  }

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <Section title={t('settings.account')} footer={t('settings.deleteAccountNote')}>
        <ListRow icon="mail-outline" label={t('settings.signedInAs')} value={session?.user.email ?? ''} />
        <Divider />
        <ListRow icon="log-out-outline" label={t('auth.signOut')} onPress={confirmSignOut} destructive />
      </Section>

      <Section title={t('settings.privacy')}>
        <ListRow icon="shield-checkmark-outline" label={t('settings.privacy')} onPress={() => router.push('/settings/privacy')} />
        <Divider />
        <ListRow icon="ban-outline" label={t('privacy.blockedUsers')} onPress={() => router.push('/settings/blocked')} />
      </Section>

      <Section title={t('settings.language')}>
        <ListRow
          icon="language-outline"
          label={t('settings.language')}
          value={locale === 'de' ? t('settings.languageGerman') : t('settings.languageEnglish')}
          onPress={() => router.push('/settings/language')}
        />
      </Section>

      <Section title={t('settings.legal')}>
        <ListRow icon="document-text-outline" label={t('legal.title')} onPress={() => router.push('/settings/legal')} />
      </Section>

      <AppText variant="caption" color="textSecondary" center>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.lg },
});
