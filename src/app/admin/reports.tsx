import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { useReportsQueue, useStorageCleanup } from '@/features/moderation/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function ReportsQueueScreen() {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const admin = useIsAdmin();
  const isAdmin = admin.data === true;
  const queue = useReportsQueue(isAdmin);
  const cleanup = useStorageCleanup(isAdmin);

  if (admin.isPending) return <LoadingView />;
  if (!isAdmin) return <EmptyView icon="lock-closed-outline" title={t('errors.permission_denied')} />;
  if (queue.isPending) return <LoadingView />;
  if (queue.isError) return <ErrorView onRetry={() => void queue.refetch()} retrying={queue.isFetching} />;

  const orphanCount = cleanup.orphans.data?.length ?? 0;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={queue.data}
      keyExtractor={(r) => r.report_id}
      refreshing={queue.isRefetching}
      onRefresh={() => {
        void queue.refetch();
        void cleanup.orphans.refetch();
      }}
      ListHeaderComponent={
        <View style={styles.cleanup}>
          <AppText variant="bodyStrong">{t('moderation.cleanupRow')}</AppText>
          <AppText variant="callout" color="textSecondary">
            {orphanCount ? t('moderation.cleanupBody', { n: orphanCount }) : t('moderation.cleanupNone')}
          </AppText>
          {orphanCount ? (
            <Button
              label={t('moderation.cleanupRun')}
              variant="secondary"
              compact
              loading={cleanup.run.isPending}
              onPress={() =>
                cleanup.run.mutate(undefined, {
                  onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
                })
              }
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title={t('moderation.empty')} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`report.reason_${item.reason}`)}
          onPress={() => router.push({ pathname: '/admin/report/[id]', params: { id: item.report_id } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowTop}>
            <AppText variant="bodyStrong" style={styles.flex}>
              {t(`report.reason_${item.reason}`)}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {ago(item.created_at)}
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary">
            {t(`report.target_${item.target_type}`)}
            {item.owner_username ? ` · ${t('moderation.owner', { username: item.owner_username })}` : ''}
            {item.open_reports > 1 ? ` · ${t('moderation.count', { n: item.open_reports })}` : ''}
          </AppText>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  cleanup: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  row: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
});
