import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GarageSection } from '@/features/garage/GarageSection';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { useI18n } from '@/i18n';
import type { Profile } from '@/lib/database.types';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView } from '@/ui';
import { Segmented } from '@/ui/Segmented';

import { useFeed, useRelationship } from './api';
import { FollowButton, PostGrid, PrivateNotice, ProfileStats } from './components';

type Tab = 'posts' | 'garage';

/**
 * Everything below the top bar of a profile: header, stats, actions and the
 * Posts / Garage tabs. Content of private accounts is replaced by a notice
 * until you are an approved follower (the server enforces the same rule).
 */
export function ProfileBody({ profile, isMe, actions }: { profile: Profile; isMe: boolean; actions?: ReactNode }) {
  const { t } = useI18n();
  const rel = useRelationship(profile.id, !isMe);
  const canSee = isMe || !profile.is_private || rel.data?.following === true;
  const [tab, setTab] = useState<Tab>('posts');

  return (
    <View style={styles.wrap}>
      <ProfileHeader
        profile={profile}
        actions={
          isMe ? (
            actions
          ) : (
            <>
              <FollowButton profile={profile} />
              {actions}
            </>
          )
        }
      />
      {!isMe && rel.data?.follows_me ? (
        <View style={styles.followsYou}>
          <AppText variant="caption" color="textSecondary">
            {t('social.followsYou')}
          </AppText>
        </View>
      ) : null}
      <ProfileStats profile={profile} canOpenLists={canSee} />

      {!isMe && rel.isPending && profile.is_private ? (
        <ActivityIndicator color={colors.accent} />
      ) : !canSee ? (
        <PrivateNotice />
      ) : (
        <>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'posts', label: t('social.posts') },
              { value: 'garage', label: t('garage.title') },
            ]}
          />
          {tab === 'posts' ? <ProfilePosts userId={profile.id} /> : <GarageSection ownerId={profile.id} isMe={isMe} />}
        </>
      )}
    </View>
  );
}

function ProfilePosts({ userId }: { userId: string }) {
  const { t } = useI18n();
  const feed = useFeed('user', userId);
  const posts = feed.data?.pages.flat() ?? [];

  if (feed.isPending) return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  if (feed.isError) {
    return (
      <View style={styles.box}>
        <ErrorView onRetry={() => void feed.refetch()} retrying={feed.isFetching} />
      </View>
    );
  }
  if (posts.length === 0) {
    return (
      <View style={styles.box}>
        <EmptyView icon="images-outline" title={t('post.noPosts')} />
      </View>
    );
  }
  return (
    <View style={styles.gridWrap}>
      <PostGrid posts={posts} />
      {feed.hasNextPage ? (
        <Button
          label={t('common.showMore')}
          variant="ghost"
          loading={feed.isFetchingNextPage}
          onPress={() => void feed.fetchNextPage()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  followsYou: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated,
  },
  loading: { marginTop: spacing.lg },
  box: { minHeight: 200 },
  // Grid goes edge to edge.
  gridWrap: { marginHorizontal: -spacing.md },
});
