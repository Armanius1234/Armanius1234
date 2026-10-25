import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { openReport } from '@/features/moderation/api';
import { useBlockUser, useProfileByUsername } from '@/features/profile/api';
import { ProfileBody } from '@/features/social/ProfileBody';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { normalizeUsername } from '@/shared/validation';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { EmptyView, ErrorView, LoadingView } from '@/ui';

/** Another member's profile. Opened via pl8://user/<username>. */
export default function UserProfileScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ username: string }>();
  const username = normalizeUsername(String(params.username ?? ''));
  const myId = useAuth().session?.user.id;
  const profile = useProfileByUsername(username);
  const block = useBlockUser();

  if (profile.isPending) return <LoadingView />;
  if (profile.isError) return <ErrorView onRetry={() => void profile.refetch()} retrying={profile.isFetching} />;
  if (!profile.data) {
    // Not found and "hidden because of a block" look the same on purpose.
    return <EmptyView icon="person-outline" title={t('profile.notFound')} />;
  }

  const target = profile.data;
  const isMe = target.id === myId;

  function confirmBlock() {
    Alert.alert(t('profile.blockTitle', { username: target.username }), t('profile.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.block'),
        style: 'destructive',
        onPress: () => {
          block.mutate(target.id, {
            onSuccess: () => router.back(),
            onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
          });
        },
      },
    ]);
  }

  const menu = () =>
    Alert.alert(`@${target.username}`, undefined, [
      { text: t('report.reportUser', { username: target.username }), onPress: () => openReport('user', target.id) },
      { text: t('profile.block'), style: 'destructive', onPress: confirmBlock },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: `@${target.username}`,
          headerRight: isMe
            ? undefined
            : () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.options')}
                  onPress={menu}
                  style={styles.headerButton}
                  disabled={block.isPending}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
                </Pressable>
              ),
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()} tintColor={colors.accent} />
        }
      >
        <ProfileBody profile={target} isMe={isMe} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  headerButton: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center' },
});
