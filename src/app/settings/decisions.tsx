import { router } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';

import { DecisionCard } from '@/features/moderation/AppealComponents';
import { useMyDecisions } from '@/features/moderation/appeals';
import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { AppText, EmptyView, ErrorView, LoadingView } from '@/ui';

/** Decisions by the PL8 team that affected the user or answered their reports. */
export default function DecisionsScreen() {
  const { t } = useI18n();
  const decisions = useMyDecisions();

  if (decisions.isPending) return <LoadingView />;
  if (decisions.isError) return <ErrorView onRetry={() => void decisions.refetch()} retrying={decisions.isFetching} />;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={decisions.data.length ? styles.list : styles.empty}
      data={decisions.data}
      keyExtractor={(d) => d.report_id}
      refreshing={decisions.isRefetching}
      onRefresh={() => void decisions.refetch()}
      ListHeaderComponent={
        decisions.data.length ? (
          <AppText color="textSecondary" style={styles.intro}>
            {t('appeal.decisionsBody')}
          </AppText>
        ) : undefined
      }
      ListEmptyComponent={<EmptyView icon="shield-checkmark-outline" title={t('appeal.decisionsEmpty')} />}
      renderItem={({ item }) => (
        <DecisionCard
          decision={item}
          onAppeal={() => router.push({ pathname: '/settings/appeal', params: { report: item.report_id } })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { flexGrow: 1 },
  intro: { marginBottom: spacing.xs },
});
