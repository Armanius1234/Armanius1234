import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { useAppealsQueue, useDecideAppeal } from '@/features/moderation/appeals';
import { ContentPreview } from '@/features/moderation/ContentPreview';
import { changedSinceReport } from '@/features/moderation/snapshot';
import { useI18n, type TKey } from '@/i18n';
import type { AppealQueueItem } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

/** What "reverse" will do for this appeal. */
function reverseEffect(a: AppealQueueItem): TKey {
  if (!a.restorable) return 'moderation.cannotRestore';
  if (a.role === 'reporter') return 'moderation.effect_reporter';
  return a.action === 'suspend' ? 'moderation.effect_suspend' : 'moderation.effect_remove';
}

export default function AppealDetailScreen() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const admin = useIsAdmin();
  const queue = useAppealsQueue(admin.data === true);
  const decide = useDecideAppeal();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const item = queue.data?.find((a) => a.appeal_id === id);

  if (admin.isPending || queue.isPending) return <LoadingView />;
  if (!item) return <EmptyView icon="checkmark-done-outline" title={t('moderation.appealsEmpty')} />;

  const run = (outcome: 'upheld' | 'reversed') => {
    setError(null);
    if (note.trim().length < 3) {
      setError(t('errors.reason_required'));
      return;
    }
    decide.mutate(
      { appealId: item.appeal_id, outcome, note },
      {
        onSuccess: () => {
          Alert.alert(t('moderation.decided'));
          router.back();
        },
        onError: (e) => setError(t(errorKey(e))),
      },
    );
  };

  const date = new Date(item.decided_at).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB');

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <AppText variant="title">{t('moderation.appealBy', { username: item.appellant_username ?? '?', role: t(`moderation.role_${item.role}`) })}</AppText>
      <AppText variant="overline" color="textSecondary">
        {t('moderation.appealText').toUpperCase()}
      </AppText>
      <AppText>“{item.appeal_reason}”</AppText>

      <AppText variant="overline" color="textSecondary">
        {t('moderation.originalDecision').toUpperCase()}
      </AppText>
      <AppText variant="bodyStrong">
        {t(`moderation.action_${item.action}`)} · {t(`report.reason_${item.report_reason}`)} · {date}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {t(`report.target_${item.target_type}`)}
        {item.owner_username ? ` · ${t('moderation.owner', { username: item.owner_username })}` : ''}
      </AppText>
      {item.decision_note ? <AppText color="textSecondary">“{item.decision_note}”</AppText> : null}

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
      <ContentPreview targetType={item.target_type} content={item.preview ?? item.snapshot} />

      <AppText variant="callout" color={item.restorable ? 'textSecondary' : 'warning'}>
        {t(reverseEffect(item))}
      </AppText>
      <TextField label={t('moderation.decisionNote')} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <FormMessage message={error} />
      <Button label={t('moderation.keep')} variant="secondary" onPress={() => run('upheld')} disabled={decide.isPending} />
      <Button label={t('moderation.reverse')} onPress={() => run('reversed')} loading={decide.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.sm },
});
