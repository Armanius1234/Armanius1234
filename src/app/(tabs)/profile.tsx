import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMyProfile } from '@/features/profile/api';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { useI18n } from '@/i18n';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, Logo, Skeleton } from '@/ui';

export default function MyProfileScreen() {
  const { t } = useI18n();
  const profile = useMyProfile();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Logo width={64} framed={false} />
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
              onRefresh={() => void profile.refetch()}
              tintColor={colors.accent}
            />
          }
        >
          <ProfileHeader
            profile={profile.data}
            actions={
              <Button
                label={t('profile.edit')}
                variant="secondary"
                compact
                style={styles.flex}
                onPress={() => router.push('/profile/edit')}
              />
            }
          />
          <View style={styles.divider} />
          <AppText variant="overline" color="textSecondary">
            {t('profile.garage').toUpperCase()}
          </AppText>
          <View style={styles.garage}>
            <EmptyView
              icon="car-sport-outline"
              title={t('placeholders.garageTitle')}
              body={t('placeholders.garageBody')}
              badge={t('placeholders.milestone', { n: 2 })}
            />
          </View>
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
  iconButton: { width: hitSize, height: hitSize, alignItems: 'flex-end', justifyContent: 'center' },
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  garage: { minHeight: 260 },
  skeletonRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  skeletonAvatar: { width: 88, height: 88, borderRadius: 44 },
  skeletonLines: { flex: 1, gap: spacing.xs },
  skeletonLine: { height: 22, width: '70%' },
  skeletonLineShort: { height: 16, width: '40%' },
  skeletonBlock: { height: 60 },
});
