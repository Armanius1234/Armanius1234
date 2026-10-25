import { FlatList, StyleSheet, View } from 'react-native';

import { useMyReports } from '@/features/moderation/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, EmptyView, ErrorView, LoadingView } from '@/ui';

const STATUS: Record<string, TKey> = {
  open: 'report.statusOpen',
  actioned: 'report.statusActioned',
  dismissed: 'report.statusDismissed',
};

export default function MyReportsScreen() {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const reports = useMyReports();

  if (reports.isPending) return <LoadingView />;
  if (reports.isError) return <ErrorView onRetry={() => void reports.refetch()} retrying={reports.isFetching} />;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={reports.data.length ? styles.list : styles.empty}
      data={reports.data}
      keyExtractor={(r) => r.report_id}
      refreshing={reports.isRefetching}
      onRefresh={() => void reports.refetch()}
      ListEmptyComponent={<EmptyView icon="flag-outline" title={t('report.noReports')} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t(`report.reason_${item.reason}`)}</AppText>
            <AppText variant="caption" color="textSecondary">
              {t(`report.target_${item.target_type}`)} · {ago(item.created_at)}
            </AppText>
          </View>
          <AppText variant="caption" color={item.status === 'open' ? 'warning' : item.status === 'actioned' ? 'success' : 'textSecondary'}>
            {t(STATUS[item.status] ?? 'report.statusOpen')}
          </AppText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm },
  empty: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flex: { flex: 1, gap: 2 },
});
