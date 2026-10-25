import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { registerForPush, unregisterPush, type PushStatus } from '@/features/notifications/push';
import { useMySettings, useUpdateSettings } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, ErrorView, FormMessage, LoadingView, Screen, Section, SwitchRow } from '@/ui';

export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const settings = useMySettings();
  const update = useUpdateSettings();
  const [status, setStatus] = useState<PushStatus | null>(null);

  if (settings.isPending) return <LoadingView />;
  if (settings.isError || !settings.data) return <ErrorView onRetry={() => void settings.refetch()} />;

  async function toggle(on: boolean) {
    update.mutate({ push_enabled: on });
    if (on) setStatus(await registerForPush({ ask: true }));
    else await unregisterPush().catch(() => undefined);
  }

  return (
    <Screen edges={['bottom']} contentStyle={styles.content}>
      <Section footer={t('notifications.pushHint')}>
        <SwitchRow
          label={t('notifications.push')}
          value={settings.data.push_enabled}
          disabled={update.isPending}
          onChange={(v) => void toggle(v)}
        />
      </Section>
      {status === 'denied' ? <AppText variant="callout" color="warning">{t('notifications.pushDenied')}</AppText> : null}
      {status === 'unavailable' ? (
        <AppText variant="callout" color="textSecondary">
          {t('notifications.pushUnavailable')}
        </AppText>
      ) : null}
      <FormMessage message={update.error ? t(errorKey(update.error)) : null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
});
