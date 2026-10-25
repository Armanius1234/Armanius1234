import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useEvidenceCleanup, useIsAdmin, useVerificationQueue } from '@/features/garage/api';
import { PlateBadge } from '@/features/garage/components';
import { useI18n } from '@/i18n';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

/** Admin-only. The server rejects every admin call from non-admins anyway. */
export default function AdminQueueScreen() {
  const { t, locale } = useI18n();
  const admin = useIsAdmin();
  const isAdmin = admin.data === true;
  const queue = useVerificationQueue(isAdmin);
  const cleanup = useEvidenceCleanup(isAdmin);

  if (admin.isPending) return <LoadingView />;
  if (!isAdmin) return <EmptyView icon="lock-closed-outline" title={t('errors.permission_denied')} />;
  if (queue.isPending) return <LoadingView />;
  if (queue.isError) return <ErrorView onRetry={() => void queue.refetch()} retrying={queue.isFetching} />;

  const leftovers = cleanup.pending.data?.length ?? 0;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={queue.data}
      keyExtractor={(item) => item.request_id}
      refreshing={queue.isRefetching}
      onRefresh={() => {
        void queue.refetch();
        void cleanup.pending.refetch();
      }}
      ListHeaderComponent={
        leftovers > 0 ? (
          <Button
            label={t('admin.cleanup', { n: leftovers })}
            variant="secondary"
            compact
            loading={cleanup.run.isPending}
            onPress={() => cleanup.run.mutate()}
          />
        ) : undefined
      }
      ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title={t('admin.empty')} />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.plate}
          onPress={() => router.push({ pathname: '/admin/[requestId]', params: { requestId: item.request_id } })}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <View style={styles.rowTop}>
            <PlateBadge plate={item.plate} size="sm" />
            {item.has_conflict ? (
              <AppText variant="caption" color="warning">
                ⚠︎
              </AppText>
            ) : null}
          </View>
          <AppText variant="bodyStrong">
            {vehicleTitle({ make: item.make, model: item.model })} · {item.model_year}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            @{item.username} ·{' '}
            {t('admin.submitted', {
              date: new Date(item.submitted_at).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB'),
            })}
          </AppText>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pressed: { opacity: 0.85 },
});
