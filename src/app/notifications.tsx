import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useMarkNotificationsRead, useNotifications } from '@/features/notifications/api';
import { notificationText } from '@/features/notifications/text';
import { pushPermission, registerForPush } from '@/features/notifications/push';
import { useMySettings } from '@/features/profile/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { NotificationItem } from '@/lib/database.types';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

const SYSTEM_ICONS: Partial<Record<NotificationItem['type'], React.ComponentProps<typeof Ionicons>['name']>> = {
  verification_approved: 'checkmark-circle',
  verification_rejected: 'close-circle',
  plate_transferred: 'swap-horizontal',
  plate_revoked: 'remove-circle',
  report_resolved: 'shield-checkmark',
  content_removed: 'alert-circle',
  account_suspended: 'lock-closed',
  appeal_decided: 'git-pull-request',
};

function open(n: NotificationItem) {
  switch (n.type) {
    case 'follow':
    case 'follow_accepted':
      if (n.actor_username) router.push({ pathname: '/user/[username]', params: { username: n.actor_username } });
      break;
    case 'follow_request':
      router.push('/follow-requests');
      break;
    case 'like':
    case 'comment':
      if (n.post_id) router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
      break;
    case 'verification_approved':
    case 'verification_rejected':
    case 'plate_transferred':
    case 'plate_revoked':
      if (n.vehicle_id) router.push({ pathname: '/vehicle/[id]/plate', params: { id: n.vehicle_id } });
      break;
    case 'report_resolved':
      // "No violation" decisions can be appealed; the rest is just a status.
      router.push(n.data.outcome === 'dismissed' ? '/settings/decisions' : '/settings/reports');
      break;
    case 'content_removed':
    case 'account_suspended':
    case 'appeal_decided':
      router.push('/settings/decisions');
      break;
    default:
      break;
  }
}

export default function NotificationsScreen() {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const pushOn = useMySettings().data?.push_enabled !== false;
  // 'undetermined' = never asked: offer to turn push on.
  const [perm, setPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable' | null>(null);
  useEffect(() => {
    void pushPermission().then(setPerm);
  }, []);

  // Opening the screen marks everything as read.
  const markReadMutate = markRead.mutate;
  useFocusEffect(
    useCallback(() => {
      markReadMutate();
    }, [markReadMutate]),
  );

  if (list.isPending) return <LoadingView />;
  if (list.isError) return <ErrorView onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  const items = list.data.pages.flat();

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={items.length ? styles.list : styles.emptyList}
      data={items}
      keyExtractor={(n) => n.notification_id}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
      }}
      ListHeaderComponent={
        !pushOn ? undefined : perm === 'denied' ? (
          <AppText variant="caption" color="textSecondary" style={styles.pushNote}>
            {t('notifications.pushDenied')}
          </AppText>
        ) : perm === 'undetermined' ? (
          <View style={styles.pushCard}>
            <AppText variant="bodyStrong">{t('notifications.enablePush')}</AppText>
            <AppText variant="callout" color="textSecondary">
              {t('notifications.enablePushBody')}
            </AppText>
            <Button
              label={t('notifications.enable')}
              compact
              onPress={() =>
                void registerForPush({ ask: true }).then((r) => setPerm(r === 'registered' ? 'granted' : r === 'denied' ? 'denied' : 'unavailable'))
              }
            />
          </View>
        ) : undefined
      }
      ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.accent} /> : undefined}
      ListEmptyComponent={
        <EmptyView icon="notifications-outline" title={t('notifications.empty')} body={t('notifications.emptyBody')} />
      }
      renderItem={({ item }) => {
        const icon = SYSTEM_ICONS[item.type];
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={notificationText(t, item)}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && styles.pressed]}
          >
            {icon ? (
              <View style={styles.systemIcon}>
                <Ionicons name={icon} size={24} color={colors.accent} />
              </View>
            ) : (
              <Avatar uri={avatarUrl(item.actor_avatar_path)} name={item.actor_display_name ?? '?'} size={44} />
            )}
            <View style={styles.body}>
              <AppText variant="callout">{notificationText(t, item)}</AppText>
              <AppText variant="caption" color="textSecondary">
                {ago(item.created_at)}
              </AppText>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.sm, gap: spacing.xxs },
  emptyList: { flexGrow: 1 },
  pushCard: {
    margin: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  pushNote: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  unread: { backgroundColor: colors.accentSubtle },
  pressed: { backgroundColor: colors.bgSecondary },
  systemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
