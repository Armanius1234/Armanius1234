import type { ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, type NativeScrollEvent } from 'react-native';

import type { FeedMode } from '@/lib/database.types';
import { colors, spacing } from '@/theme/tokens';
import { EmptyView, ErrorView, Skeleton } from '@/ui';

import { useFeed } from './api';
import { PostGrid } from './components';

function nearBottom({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) {
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - 400;
}

/** Photo grid feed with pull-to-refresh and infinite scroll (Discover, Saved). */
export function GridFeedScreen({
  mode,
  header,
  emptyTitle,
  emptyBody,
}: {
  mode: Extract<FeedMode, 'discover' | 'saved'>;
  header?: ReactNode;
  emptyTitle: string;
  emptyBody: string;
}) {
  const feed = useFeed(mode);
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} tintColor={colors.accent} />
      }
      onScroll={(e) => {
        if (nearBottom(e.nativeEvent) && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
      }}
      scrollEventThrottle={250}
    >
      {header}
      {feed.isPending ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : feed.isError ? (
        <View style={styles.box}>
          <ErrorView onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.box}>
          <EmptyView icon="images-outline" title={emptyTitle} body={emptyBody} />
        </View>
      ) : (
        <PostGrid posts={posts} />
      )}
      {feed.isFetchingNextPage ? <ActivityIndicator color={colors.accent} style={styles.footer} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingBottom: spacing.xxl, flexGrow: 1 },
  skeletons: { flexDirection: 'row', gap: 2 },
  skeleton: { flex: 1, aspectRatio: 1, borderRadius: 0 },
  box: { flex: 1, minHeight: 320 },
  footer: { padding: spacing.lg },
});
