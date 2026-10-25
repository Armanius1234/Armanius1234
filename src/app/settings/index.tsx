import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { exportMyData } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useIsAdmin } from '@/features/garage/api';
import { unregisterPush } from '@/features/notifications/push';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Divider, ListRow, Screen, Section } from '@/ui';

export default function SettingsScreen() {
  const { t, locale } = useI18n();
  const { session, signOut } = useAuth();
  const isAdmin = useIsAdmin().data === true;
  const [exporting, setExporting] = useState(false);

  function runExport() {
    setExporting(true);
    exportMyData(t('account.exportShareTitle'))
      .catch((e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e))))
      .finally(() => setExporting(false));
  }

  function confirmSignOut() {
    Alert.alert(t('settings.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: () => {
          unregisterPush()
            .catch(() => undefined)
            .then(() => signOut())
            .catch((e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e))));
        },
      },
    ]);
  }

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <Section title={t('settings.account')}>
        <ListRow icon="mail-outline" label={t('settings.signedInAs')} value={session?.user.email ?? ''} />
        <Divider />
        <ListRow icon="log-out-outline" label={t('auth.signOut')} onPress={confirmSignOut} destructive />
      </Section>

      <Section title={t('settings.notifications')}>
        <ListRow
          icon="notifications-outline"
          label={t('notifications.settingsTitle')}
          onPress={() => router.push('/settings/notifications')}
        />
      </Section>

      <Section title={t('settings.privacy')}>
        <ListRow icon="shield-checkmark-outline" label={t('settings.privacy')} onPress={() => router.push('/settings/privacy')} />
        <Divider />
        <ListRow icon="ban-outline" label={t('privacy.blockedUsers')} onPress={() => router.push('/settings/blocked')} />
        <Divider />
        <ListRow icon="flag-outline" label={t('report.myReports')} onPress={() => router.push('/settings/reports')} />
      </Section>

      <Section footer={t('account.exportBody')}>
        <ListRow
          icon="download-outline"
          label={exporting ? t('common.loading') : t('account.exportRow')}
          onPress={exporting ? undefined : runExport}
        />
        <Divider />
        <ListRow
          icon="trash-outline"
          label={t('account.deleteRow')}
          destructive
          onPress={() => router.push('/settings/delete-account')}
        />
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

      {isAdmin ? (
        <Section title={t('settings.admin')}>
          <ListRow icon="shield-outline" label={t('admin.settingsRow')} onPress={() => router.push('/admin')} />
          <Divider />
          <ListRow icon="flag-outline" label={t('moderation.settingsRow')} onPress={() => router.push('/admin/reports')} />
        </Section>
      ) : null}

      <AppText variant="caption" color="textSecondary" center>
        {t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.lg },
});
