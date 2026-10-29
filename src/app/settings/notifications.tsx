import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { registerForPush, unregisterPush, type PushStatus } from '@/features/notifications/push';
import { useMySettings, useUpdateSettings } from '@/features/profile/api';
import { useI18n, type TKey } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Divider, ErrorView, FormMessage, LoadingView, Screen, Section, SwitchRow } from '@/ui';

// Plate updates and decisions by the PL8 team are always sent (not listed).
const TYPES: ['push_likes' | 'push_comments' | 'push_follows' | 'push_messages', TKey][] = [
  ['push_messages', 'notifications.pushMessages'],
  ['push_follows', 'notifications.pushFollows'],
  ['push_comments', 'notifications.pushComments'],
  ['push_likes', 'notifications.pushLikes'],
];

export default function NotificationSettingsScreen() {
  const { t } = useI18n();
  const settings = useMySettings();
  const update = useUpdateSettings();
  const [status, setStatus] = useState<PushStatus | null>(null);

  if (settings.isPending) return <LoadingView />;
  if (settings.isError || !settings.data) return <ErrorView onRetry={() => void settings.refetch()} />;
  const current = settings.data;

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
      <Section title={t('notifications.pushTypes')} footer={t('notifications.pushAlways')}>
        {TYPES.map(([key, label], i) => (
          <View key={key}>
            {i > 0 ? <Divider /> : null}
            <SwitchRow
              label={t(label)}
              value={current[key]}
              disabled={update.isPending || !current.push_enabled}
              onChange={(v) => update.mutate({ [key]: v })}
            />
          </View>
        ))}
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
