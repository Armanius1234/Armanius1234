import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useHideConversation, useInbox } from '@/features/messaging/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { InboxItem } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, EmptyView, ErrorView, Logo, Skeleton } from '@/ui';
import { Segmented } from '@/ui/Segmented';

type Tab = 'chats' | 'requests';

export default function MessagesScreen() {
  const { t } = useI18n();
  const inbox = useInbox();
  const [tab, setTab] = useState<Tab>('chats');
  const items = inbox.data ?? [];
  const requests = items.filter((i) => i.is_request_for_me);
  const chats = items.filter((i) => !i.is_request_for_me);
  const shown = tab === 'chats' ? chats : requests;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <AppText variant="title">{t('tabs.messages')}</AppText>
          <Logo width={64} framed={false} />
        </View>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'chats', label: t('chat.chats') },
            {
              value: 'requests',
              label: requests.length ? t('chat.requestsCount', { n: requests.length }) : t('chat.requests'),
            },
          ]}
        />
      </View>

      {inbox.isPending ? (
        <View style={styles.skeletons}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : inbox.isError ? (
        <ErrorView onRetry={() => void inbox.refetch()} retrying={inbox.isFetching} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(i) => i.conversation_id}
          refreshing={inbox.isRefetching}
          onRefresh={() => void inbox.refetch()}
          contentContainerStyle={shown.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            tab === 'chats' ? (
              <EmptyView icon="chatbubbles-outline" title={t('chat.empty')} body={t('chat.emptyBody')} />
            ) : (
              <EmptyView icon="mail-unread-outline" title={t('chat.requestsEmpty')} body={t('chat.requestsEmptyBody')} />
            )
          }
          renderItem={({ item }) => <InboxRow item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const unread = item.unread_count > 0;
  const pending = item.status === 'request' && !item.is_request_for_me;
  const hide = useHideConversation();
  const confirmDelete = () =>
    Alert.alert(t('chat.deleteChatTitle'), t('chat.deleteChatBody', { name: item.other_display_name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.deleteChat'),
        style: 'destructive',
        onPress: () =>
          hide.mutate(item.conversation_id, { onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))) }),
      },
    ]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.other_display_name}${unread ? `, ${item.unread_count}` : ''}`}
      accessibilityHint={t('chat.deleteChat')}
      accessibilityActions={[{ name: 'delete', label: t('chat.deleteChat') }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'delete') confirmDelete();
      }}
      onLongPress={confirmDelete}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar uri={avatarUrl(item.other_avatar_path)} name={item.other_display_name} size={52} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {item.other_display_name}
          </AppText>
          <AppText variant="caption" color={unread ? 'accent' : 'textSecondary'}>
            {ago(item.last_message_at)}
          </AppText>
        </View>
        <View style={styles.rowTop}>
          <AppText
            variant="callout"
            color={unread ? 'textPrimary' : 'textSecondary'}
            numberOfLines={1}
            style={styles.flex}
          >
            {pending ? t('chat.pending', { name: item.other_display_name }) : `${item.last_message_mine ? t('chat.you') : ''}${item.last_message ?? ''}`}
          </AppText>
          {unread ? (
            <View style={styles.badge}>
              <AppText variant="caption">{item.unread_count > 99 ? '99+' : item.unread_count}</AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skeletons: { padding: spacing.md, gap: spacing.sm },
  skeleton: { height: 64 },
  list: { paddingHorizontal: spacing.xs },
  emptyContainer: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  pressed: { backgroundColor: colors.bgSecondary },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.accentSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
