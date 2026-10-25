import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMyProfile } from '@/features/profile/api';
import { useFollowRequests } from '@/features/social/api';
import { ProfileBody } from '@/features/social/ProfileBody';
import { useI18n } from '@/i18n';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { Button, ErrorView, ListRow, Logo, Section, Skeleton } from '@/ui';

export default function MyProfileScreen() {
  const { t } = useI18n();
  const profile = useMyProfile();
  const requests = useFollowRequests();
  const pending = requests.data?.length ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Logo width={64} framed={false} />
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('post.savedTitle')}
            onPress={() => router.push('/saved')}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons name="bookmark-outline" size={24} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.settings')}
            onPress={() => router.push('/settings')}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {profile.isPending ? (
        <View style={styles.content}>
          <View style={styles.skeletonRow}>
            <Skeleton style={styles.skeletonAvatar} />
            <View style={styles.skeletonLines}>
              <Skeleton style={styles.skeletonLine} />
              <Skeleton style={styles.skeletonLineShort} />
            </View>
          </View>
          <Skeleton style={styles.skeletonBlock} />
        </View>
      ) : profile.isError || !profile.data ? (
        <ErrorView onRetry={() => void profile.refetch()} retrying={profile.isFetching} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={profile.isRefetching}
              onRefresh={() => {
                void profile.refetch();
                void requests.refetch();
              }}
              tintColor={colors.accent}
            />
          }
        >
          {pending > 0 ? (
            <Section>
              <ListRow
                icon="person-add-outline"
                label={t('social.requestsRow', { n: pending })}
                onPress={() => router.push('/follow-requests')}
              />
            </Section>
          ) : null}
          <ProfileBody
            profile={profile.data}
            isMe
            actions={
              <>
                <Button
                  label={t('profile.edit')}
                  variant="secondary"
                  compact
                  style={styles.flex}
                  onPress={() => router.push('/profile/edit')}
                />
                <Button
                  label={t('feed.newPost')}
                  compact
                  style={styles.flex}
                  icon={<Ionicons name="add" size={18} color="#fff" />}
                  onPress={() => router.push('/post/new')}
                />
              </>
            }
          />
        </ScrollView>
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
  topActions: { flexDirection: 'row', gap: spacing.xs },
  iconButton: { width: hitSize, height: hitSize, alignItems: 'flex-end', justifyContent: 'center' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  skeletonAvatar: { width: 88, height: 88, borderRadius: 44 },
  skeletonLines: { flex: 1, gap: spacing.xs },
  skeletonLine: { height: 22, width: '70%' },
  skeletonLineShort: { height: 16, width: '40%' },
  skeletonBlock: { height: 60 },
});
