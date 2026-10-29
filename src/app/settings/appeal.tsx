import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AppealForm, DecisionCard } from '@/features/moderation/AppealComponents';
import { useMyDecisions } from '@/features/moderation/appeals';
import { useI18n } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { Button, EmptyView, LoadingView, Screen } from '@/ui';

/** Appeal one decision. Opened with ?report=<report id>. */
export default function AppealScreen() {
  const { t } = useI18n();
  const { report } = useLocalSearchParams<{ report: string }>();
  const decisions = useMyDecisions();
  const decision = decisions.data?.find((d) => d.report_id === report);

  if (decisions.isPending) return <LoadingView />;
  if (!decision) return <EmptyView icon="shield-outline" title={t('errors.invalid_state')} />;

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <DecisionCard decision={decision} />
      {decision.appeal_id ? (
        <Button label={t('common.done')} onPress={() => router.back()} />
      ) : (
        <AppealForm reportId={decision.report_id} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
});
