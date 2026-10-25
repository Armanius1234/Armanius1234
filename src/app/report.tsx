import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useReportContent } from '@/features/moderation/api';
import { useI18n } from '@/i18n';
import type { ReportReason, ReportTarget } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, ChoiceGroup, EmptyView, FormMessage, Screen, Section, TextField } from '@/ui';

const TARGETS: ReportTarget[] = ['user', 'post', 'comment', 'message', 'vehicle'];
const REASONS: ReportReason[] = ['spam', 'harassment', 'hate', 'nudity', 'violence', 'impersonation', 'privacy', 'illegal', 'other'];

/** Report screen. Opened with ?type=post&id=<uuid>. */
export default function ReportScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const type = TARGETS.find((x) => x === params.type);
  const id = typeof params.id === 'string' ? params.id : '';
  const report = useReportContent();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!type || !id) return <EmptyView icon="flag-outline" title={t('errors.invalid_state')} />;

  if (report.isSuccess) {
    return (
      <Screen edges={['bottom']} contentStyle={styles.done}>
        <EmptyView icon="shield-checkmark-outline" title={t('report.sent')} body={type !== 'vehicle' ? t('report.alsoBlock') : undefined} />
        <Button label={t('common.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        <Button
          label={t('report.submit')}
          loading={report.isPending}
          onPress={() => {
            setError(null);
            report.mutate({ type, id, reason, details }, { onError: (e) => setError(t(errorKey(e))) });
          }}
        />
      }
    >
      <AppText variant="heading">{t('report.question')}</AppText>
      <Section>
        <ChoiceGroup<ReportReason>
          value={reason}
          onChange={setReason}
          options={REASONS.map((r) => ({ value: r, label: t(`report.reason_${r}`) }))}
        />
      </Section>
      <View>
        <TextField
          label={t('report.details')}
          value={details}
          onChangeText={setDetails}
          placeholder={t('report.detailsPlaceholder')}
          multiline
          maxLength={1000}
        />
      </View>
      <FormMessage message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  done: { justifyContent: 'center', gap: spacing.md, paddingBottom: spacing.xl },
});
