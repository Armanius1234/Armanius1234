import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useFollowRequests, useRespondRequest } from '@/features/social/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function FollowRequestsScreen() {
  const { t } = useI18n();
  const requests = useFollowRequests();
  const respond = useRespondRequest();

  if (requests.isPending) return <LoadingView />;
  if (requests.isError) return <ErrorView onRetry={() => void requests.refetch()} retrying={requests.isFetching} />;

  const act = (requester: string, accept: boolean) =>
    respond.mutate(
      { requester, accept },
      { onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))) },
    );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={requests.data}
      keyExtractor={(i) => i.user_id}
      refreshing={requests.isRefetching}
      onRefresh={() => void requests.refetch()}
      ListEmptyComponent={<EmptyView icon="person-add-outline" title={t('social.noRequests')} />}
      renderItem={({ item }) => {
        const busy = respond.isPending && respond.variables?.requester === item.user_id;
        return (
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`@${item.username}`}
              onPress={() => router.push({ pathname: '/user/[username]', params: { username: item.username } })}
              style={styles.person}
            >
              <Avatar uri={avatarUrl(item.avatar_path)} name={item.display_name} size={44} />
              <View style={styles.names}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.display_name}
                </AppText>
                <AppText variant="callout" color="textSecondary" numberOfLines={1}>
                  @{item.username}
                </AppText>
              </View>
            </Pressable>
            <Button label={t('social.accept')} compact loading={busy} onPress={() => act(item.user_id, true)} />
            <Button
              label={t('social.decline')}
              variant="secondary"
              compact
              disabled={busy}
              onPress={() => act(item.user_id, false)}
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  names: { flex: 1 },
});
