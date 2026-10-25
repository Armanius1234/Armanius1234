import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { GarageSection } from '@/features/garage/GarageSection';
import { useBlockUser, useProfileByUsername } from '@/features/profile/api';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { normalizeUsername } from '@/shared/validation';
import { colors, hitSize, spacing } from '@/theme/tokens';
import { EmptyView, ErrorView, LoadingView } from '@/ui';

/** Another member's public profile. Opened via pl8://user/<username>. */
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
                  accessibilityLabel={t('profile.block')}
                  onPress={confirmBlock}
                  style={styles.headerButton}
                  disabled={block.isPending}
                >
                  <Ionicons name="ban-outline" size={22} color={colors.textPrimary} />
                </Pressable>
              ),
        }}
      />
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <ProfileHeader profile={target} />
        <View style={styles.divider} />
        <GarageSection ownerId={target.id} isMe={isMe} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.md, gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  headerButton: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center' },
});
