import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { useAppealsQueue } from '@/features/moderation/appeals';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function AppealsQueueScreen() {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const admin = useIsAdmin();
  const isAdmin = admin.data === true;
  const queue = useAppealsQueue(isAdmin);

  if (admin.isPending) return <LoadingView />;
  if (!isAdmin) return <EmptyView icon="lock-closed-outline" title={t('errors.permission_denied')} />;
  if (queue.isPending) return <LoadingView />;
  if (queue.isError) return <ErrorView onRetry={() => void queue.refetch()} retrying={queue.isFetching} />;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={queue.data}
      keyExtractor={(a) => a.appeal_id}
      refreshing={queue.isRefetching}
      onRefresh={() => void queue.refetch()}
      ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title={t('moderation.appealsEmpty')} />}
      renderItem={({ item }) => {
        const title = `${t(`moderation.action_${item.action}`)} · ${t(`report.reason_${item.report_reason}`)}`;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={() => router.push({ pathname: '/admin/appeal/[id]', params: { id: item.appeal_id } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowTop}>
              <AppText variant="bodyStrong" style={styles.flex}>
                {title}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {ago(item.created_at)}
              </AppText>
            </View>
            <AppText variant="caption" color="textSecondary">
              {t('moderation.appealBy', {
                username: item.appellant_username ?? '?',
                role: t(`moderation.role_${item.role}`),
              })}
            </AppText>
            <AppText variant="callout" numberOfLines={2}>
              “{item.appeal_reason}”
            </AppText>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
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
