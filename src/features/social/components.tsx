import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { openReport } from '@/features/moderation/api';
import { useSignedUrls } from '@/features/garage/api';
import { useI18n } from '@/i18n';
import type { FeedPost, Profile } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { compactCount, timeAgo } from '@/shared/time';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView } from '@/ui';

import { useDeletePost, useFollow, useRelationship, useToggleLike, useToggleSave, useUnfollow } from './api';

// ------------------------------------------------------------ helpers ------

export function useTimeAgo() {
  const { t, locale } = useI18n();
  return (iso: string) => {
    const r = timeAgo(iso);
    switch (r.unit) {
      case 'now':
        return t('post.timeNow');
      case 'minutes':
        return t('post.timeMinutes', { n: r.n });
      case 'hours':
        return t('post.timeHours', { n: r.n });
      case 'days':
        return t('post.timeDays', { n: r.n });
      case 'date':
        return r.date.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB');
    }
  };
}

// -------------------------------------------------------------- follow -----

export function FollowButton({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const rel = useRelationship(profile.id);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const busy = follow.isPending || unfollow.isPending || rel.isPending;
  const onError = (e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e)));

  if (rel.data?.following) {
    return (
      <Button
        label={t('social.following')}
        variant="secondary"
        compact
        style={styles.flex}
        loading={busy}
        onPress={() =>
          Alert.alert(t('social.unfollowTitle', { username: profile.username }), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('social.unfollow'), style: 'destructive', onPress: () => unfollow.mutate(profile.id, { onError }) },
          ])
        }
      />
    );
  }
  if (rel.data?.requested) {
    return (
      <Button
        label={t('social.requested')}
        variant="secondary"
        compact
        style={styles.flex}
        loading={busy}
        onPress={() =>
          Alert.alert(t('social.withdrawTitle'), undefined, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('social.withdraw'), style: 'destructive', onPress: () => unfollow.mutate(profile.id, { onError }) },
          ])
        }
      />
    );
  }
  return (
    <Button
      label={rel.data?.follows_me ? t('social.followBack') : t('social.follow')}
      compact
      style={styles.flex}
      loading={busy}
      onPress={() => follow.mutate(profile.id, { onError })}
    />
  );
}

export function ProfileStats({ profile, canOpenLists }: { profile: Profile; canOpenLists: boolean }) {
  const { t } = useI18n();
  const items = [
    { label: t('social.posts'), value: profile.post_count, kind: null },
    { label: t('social.followers'), value: profile.follower_count, kind: 'followers' as const },
    { label: t('social.followingTitle'), value: profile.following_count, kind: 'following' as const },
  ];
  return (
    <View style={styles.stats}>
      {items.map((item) => {
        const content = (
          <>
            <AppText variant="heading">{compactCount(item.value)}</AppText>
            <AppText variant="caption" color="textSecondary">
              {item.label}
            </AppText>
          </>
        );
        return item.kind && canOpenLists ? (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={`${item.value} ${item.label}`}
            style={styles.stat}
            onPress={() =>
              router.push({ pathname: `/user/[username]/${item.kind}`, params: { username: profile.username } })
            }
          >
            {content}
          </Pressable>
        ) : (
          <View key={item.label} style={styles.stat} accessibilityLabel={`${item.value} ${item.label}`}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

export function PrivateNotice() {
  const { t } = useI18n();
  return (
    <View style={styles.privateBox}>
      <EmptyView icon="lock-closed-outline" title={t('social.privateTitle')} body={t('social.privateBody')} />
    </View>
  );
}

// ---------------------------------------------------------------- posts ----

function PostImage({ path, url, size }: { path: string; url: string | undefined; size: number }) {
  return (
    <View style={[styles.media, { width: size, height: size }]}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: path }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          recyclingKey={path}
        />
      ) : null}
    </View>
  );
}

export function PostCard({ post, onOpen }: { post: FeedPost; onOpen?: () => void }) {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const uid = useAuth().session?.user.id;
  const { width } = useWindowDimensions();
  const urls = useSignedUrls('post-media', post.media_paths);
  const likeMutation = useToggleLike();
  const saveMutation = useToggleSave();
  const remove = useDeletePost();

  // Optimistic UI: update instantly, roll back on error.
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved);
  const [page, setPage] = useState(0);

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    likeMutation.mutate(
      { postId: post.post_id, like: next },
      {
        onError: () => {
          setLiked(!next);
          setLikes((n) => n + (next ? -1 : 1));
        },
      },
    );
  };
  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    saveMutation.mutate({ postId: post.post_id, save: next }, { onError: () => setSaved(!next) });
  };
  const mine = post.author_id === uid;
  const options = () =>
    Alert.alert(t('post.options'), undefined, mine ? [
      { text: t('post.edit'), onPress: () => router.push({ pathname: '/post/edit', params: { id: post.post_id } }) },
      {
        text: t('post.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('post.deleteTitle'), t('post.deleteBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('post.delete'),
              style: 'destructive',
              onPress: () =>
                remove.mutate(post, {
                  onSuccess: () => {
                    if (router.canGoBack()) router.back();
                  },
                  onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
                }),
            },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ] : [
      { text: t('report.reportPost'), style: 'destructive', onPress: () => openReport('post', post.post_id) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const vehicle = post.vehicle_make
    ? vehicleTitle({ make: post.vehicle_make, model: post.vehicle_model ?? '', generation: post.vehicle_generation })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`@${post.author_username}`}
          style={styles.author}
          onPress={() => router.push({ pathname: '/user/[username]', params: { username: post.author_username } })}
        >
          <Avatar uri={avatarUrl(post.author_avatar_path)} name={post.author_display_name} size={36} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {post.author_display_name}
            </AppText>
            {vehicle ? (
              <AppText
                variant="caption"
                color="accent"
                numberOfLines={1}
                onPress={
                  post.vehicle_id
                    ? () => router.push({ pathname: '/vehicle/[id]', params: { id: post.vehicle_id! } })
                    : undefined
                }
              >
                {vehicle}
              </AppText>
            ) : (
              <AppText variant="caption" color="textSecondary">
                @{post.author_username}
              </AppText>
            )}
          </View>
        </Pressable>
        <AppText variant="caption" color="textSecondary">
          {ago(post.published_at)}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('post.options')} onPress={options} style={styles.icon}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityLabel={t('post.title')}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={post.media_paths.length > 1}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {post.media_paths.map((p) => (
            <PostImage key={p} path={p} url={urls.data?.[p]} size={width} />
          ))}
        </ScrollView>
      </Pressable>
      {post.media_paths.length > 1 ? (
        <View style={styles.dots}>
          {post.media_paths.map((p, i) => (
            <View key={p} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={liked ? t('post.unlike') : t('post.like')}
          accessibilityState={{ selected: liked }}
          onPress={toggleLike}
          style={styles.action}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? colors.danger : colors.textPrimary} />
          <AppText variant="callout">{compactCount(likes)}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('post.comment')}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.post_id } })}
          style={styles.action}
        >
          <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
          <AppText variant="callout">{compactCount(post.comment_count)}</AppText>
        </Pressable>
        <View style={styles.flex} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? t('post.unsave') : t('post.save')}
          accessibilityState={{ selected: saved }}
          onPress={toggleSave}
          style={styles.action}
        >
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? colors.accent : colors.textPrimary} />
        </Pressable>
      </View>

      {post.caption ? (
        <AppText style={styles.caption}>
          <AppText variant="bodyStrong">{post.author_username} </AppText>
          {post.caption}
        </AppText>
      ) : null}
    </View>
  );
}

/** Three-column photo grid (profile posts, discover). */
export function PostGrid({ posts }: { posts: FeedPost[] }) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const size = Math.floor((width - 4) / 3);
  const covers = posts.flatMap((p) => (p.media_paths[0] ? [p.media_paths[0]] : []));
  const urls = useSignedUrls('post-media', covers);
  return (
    <View style={styles.grid}>
      {posts.map((p) => {
        const cover = p.media_paths[0];
        return (
          <Pressable
            key={p.post_id}
            accessibilityRole="button"
            accessibilityLabel={t('post.title')}
            onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.post_id } })}
          >
            {cover ? <PostImage path={cover} url={urls.data?.[cover]} size={size} /> : null}
            {p.media_paths.length > 1 ? (
              <Ionicons name="copy" size={14} color="#fff" style={styles.multi} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', minWidth: 72, minHeight: hitSize, justifyContent: 'center' },
  privateBox: { minHeight: 220 },
  card: { backgroundColor: colors.bgPrimary, paddingBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center' },
  media: { backgroundColor: colors.bgElevated },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: hitSize, paddingHorizontal: spacing.xs },
  caption: { paddingHorizontal: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  multi: { position: 'absolute', top: 6, right: 6 },
});

