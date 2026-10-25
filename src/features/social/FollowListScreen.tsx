import { router, Stack } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfileByUsername } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

import { useFollowList, useRemoveFollower } from './api';

export function FollowListScreen({ username, kind }: { username: string; kind: 'followers' | 'following' }) {
  const { t } = useI18n();
  const myId = useAuth().session?.user.id;
  const profile = useProfileByUsername(username);
  const list = useFollowList(profile.data?.id ?? '', kind);
  const remove = useRemoveFollower();
  const title = kind === 'followers' ? t('social.followers') : t('social.followingTitle');

  if (profile.isPending || (profile.data && list.isPending)) return <LoadingView />;
  if (!profile.data) return <EmptyView icon="person-outline" title={t('profile.notFound')} />;
  if (list.isError) {
    return errorKey(list.error) === 'errors.private_account' ? (
      <EmptyView icon="lock-closed-outline" title={t('social.privateTitle')} body={t('social.privateBody')} />
    ) : (
      <ErrorView onRetry={() => void list.refetch()} retrying={list.isFetching} />
    );
  }

  const ownFollowers = kind === 'followers' && profile.data.id === myId;
  const items = list.data?.pages.flat() ?? [];

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.root}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(i) => i.user_id}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          <EmptyView
            icon="people-outline"
            title={kind === 'followers' ? t('social.noFollowers') : t('social.noFollowing')}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`@${item.username}`}
            onPress={() => router.push({ pathname: '/user/[username]', params: { username: item.username } })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
            {ownFollowers ? (
              <Button
                label={t('social.remove')}
                variant="secondary"
                compact
                loading={remove.isPending && remove.variables === item.user_id}
                onPress={() =>
                  Alert.alert(t('social.removeFollowerTitle', { username: item.username }), t('social.removeFollowerBody'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('social.remove'),
                      style: 'destructive',
                      onPress: () =>
                        remove.mutate(item.user_id, {
                          onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
                        }),
                    },
                  ])
                }
              />
            ) : null}
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.xs, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.xs, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgSecondary },
  names: { flex: 1 },
});
