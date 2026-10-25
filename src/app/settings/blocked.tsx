import { FlatList, StyleSheet, View } from 'react-native';

import { useBlockedUsers, useUnblockUser } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function BlockedUsersScreen() {
  const { t } = useI18n();
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();

  if (blocked.isPending) return <LoadingView />;
  if (blocked.isError) return <ErrorView onRetry={() => void blocked.refetch()} retrying={blocked.isFetching} />;
  if (blocked.data.length === 0) return <EmptyView icon="ban-outline" title={t('settings.blockedEmpty')} />;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={blocked.data}
      keyExtractor={(item) => item.user_id}
      onRefresh={() => void blocked.refetch()}
      refreshing={blocked.isRefetching}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Avatar uri={avatarUrl(item.avatar_path)} name={item.display_name} size={44} />
          <View style={styles.names}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {item.display_name}
            </AppText>
            <AppText variant="callout" color="textSecondary" numberOfLines={1}>
              @{item.username}
            </AppText>
          </View>
          <Button
            label={t('profile.unblock')}
            variant="secondary"
            compact
            loading={unblock.isPending && unblock.variables === item.user_id}
            onPress={() => unblock.mutate(item.user_id)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  names: { flex: 1 },
});
