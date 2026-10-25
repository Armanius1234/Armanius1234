import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUnreadNotifications } from '@/features/notifications/api';
import { useFeed } from '@/features/social/api';
import { PostCard } from '@/features/social/components';
import { useI18n } from '@/i18n';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, Logo, Skeleton } from '@/ui';

export default function HomeScreen() {
  const { t } = useI18n();
  const feed = useFeed('home');
  const posts = feed.data?.pages.flat() ?? [];
  const unread = useUnreadNotifications().data ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Logo width={72} framed={false} />
        <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? t('notifications.unreadLabel', { n: unread }) : t('notifications.title')}
          onPress={() => router.push('/notifications')}
          style={styles.iconButton}
          hitSlop={8}
        >
          <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={26} color={colors.textPrimary} />
          {unread ? (
            <View style={styles.badge}>
              <AppText variant="caption" style={styles.badgeText}>
                {unread > 99 ? '99+' : unread}
              </AppText>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('feed.newPost')}
          onPress={() => router.push('/post/new')}
          style={styles.iconButton}
          hitSlop={8}
        >
          <Ionicons name="add-circle-outline" size={28} color={colors.textPrimary} />
        </Pressable>
        </View>
      </View>

      {feed.isPending ? (
        <View style={styles.skeletons}>
          <Skeleton style={styles.skeletonHeader} />
          <Skeleton style={styles.skeletonImage} />
        </View>
      ) : feed.isError ? (
        <ErrorView onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.post_id}
          renderItem={({ item }) => (
            <PostCard post={item} onOpen={() => router.push({ pathname: '/post/[id]', params: { id: item.post_id } })} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
          }}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => void feed.refetch()}
          ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={styles.footer} /> : undefined}
          contentContainerStyle={posts.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EmptyView icon="car-sport-outline" title={t('feed.homeEmpty')} body={t('feed.homeEmptyBody')} />
              <Button label={t('feed.newPost')} onPress={() => router.push('/post/new')} />
              <Button label={t('tabs.discover')} variant="secondary" onPress={() => router.push('/discover')} />
            </View>
          }
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={3}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconButton: { width: hitSize, height: hitSize, alignItems: 'flex-end', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, lineHeight: 14 },
  skeletons: { padding: spacing.md, gap: spacing.sm },
  skeletonHeader: { height: 36, width: '60%' },
  skeletonImage: { height: 360 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  footer: { padding: spacing.lg },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
});
