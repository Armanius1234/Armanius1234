import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { useReportsQueue, useResolveReport } from '@/features/moderation/api';
import { ContentPreview } from '@/features/moderation/ContentPreview';
import { changedSinceReport } from '@/features/moderation/snapshot';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

export default function ReportDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const admin = useIsAdmin();
  const queue = useReportsQueue(admin.data === true);
  const resolve = useResolveReport();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const item = queue.data?.find((r) => r.report_id === id);

  if (admin.isPending || queue.isPending) return <LoadingView />;
  if (!item) return <EmptyView icon="checkmark-done-outline" title={t('moderation.empty')} />;

  const run = (action: 'dismiss' | 'remove' | 'suspend') => {
    setError(null);
    if (action !== 'dismiss' && note.trim().length < 3) {
      setError(t('errors.reason_required'));
      return;
    }
    const go = () =>
      resolve.mutate(
        { reportId: item.report_id, action, note },
        {
          onSuccess: () => {
            Alert.alert(t('moderation.done'));
            router.back();
          },
          onError: (e) => setError(t(errorKey(e))),
        },
      );
    if (action === 'suspend') {
      Alert.alert(t('moderation.suspendTitle', { username: item.owner_username ?? '' }), t('moderation.suspendBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('moderation.suspend'), style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <AppText variant="title">{t(`report.reason_${item.reason}`)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {t(`report.target_${item.target_type}`)}
        {item.reporter_username ? ` · ${t('moderation.reportedBy', { username: item.reporter_username })}` : ''}
        {item.owner_username ? ` · ${t('moderation.owner', { username: item.owner_username })}` : ''}
      </AppText>
      {item.details ? <AppText color="textSecondary">“{item.details}”</AppText> : null}
      {item.open_reports > 1 ? (
        <AppText variant="callout" color="warning">
          {t('moderation.count', { n: item.open_reports })}
        </AppText>
      ) : null}

      {changedSinceReport(item) ? (
        <>
          <AppText variant="overline" color="warning">
            {t('moderation.atReport').toUpperCase()}
          </AppText>
          <ContentPreview targetType={item.target_type} content={item.snapshot} />
          <AppText variant="overline" color="textSecondary">
            {t('moderation.now').toUpperCase()}
          </AppText>
        </>
      ) : null}
      <ContentPreview targetType={item.target_type} content={item.preview} />

      <TextField label={t('moderation.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <FormMessage message={error} />
      <Button label={t('moderation.dismiss')} variant="secondary" onPress={() => run('dismiss')} disabled={resolve.isPending} />
      {item.target_type !== 'user' ? (
        <Button label={t('moderation.remove')} onPress={() => run('remove')} loading={resolve.isPending} />
      ) : null}
      {item.owner_id ? (
        <Button label={t('moderation.suspend')} variant="destructive" onPress={() => run('suspend')} disabled={resolve.isPending} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.sm },
});
