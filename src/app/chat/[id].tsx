import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  useConversation,
  useMarkRead,
  useMessages,
  useRespondMessageRequest,
  useSendMessage,
  useUnsendMessage,
} from '@/features/messaging/api';
import { openReport } from '@/features/moderation/api';
import { useBlockUser } from '@/features/profile/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { Message } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, fonts, hitSize, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function ChatScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const uid = useAuth().session?.user.id;
  const info = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkRead(conversationId);
  const respond = useRespondMessageRequest(conversationId);
  const unsend = useUnsendMessage(conversationId);
  const block = useBlockUser();
  const ago = useTimeAgo();
  const [body, setBody] = useState('');

  const list = messages.data?.pages.flat() ?? [];
  const newestId = list[0]?.id;
  const markReadMutate = markRead.mutate;

  // Mark as read when opened and whenever a new message arrives.
  useEffect(() => {
    if (info.data && newestId) markReadMutate();
  }, [info.data, newestId, markReadMutate]);

  if (info.isPending) return <LoadingView />;
  if (info.isError) {
    return errorKey(info.error) === 'errors.permission_denied' ? (
      <EmptyView icon="chatbubbles-outline" title={t('chat.notFound')} />
    ) : (
      <ErrorView onRetry={() => void info.refetch()} retrying={info.isFetching} />
    );
  }
  if (!info.data) return <EmptyView icon="chatbubbles-outline" title={t('chat.notFound')} />;

  const c = info.data;
  const iSentAMessage = list.some((m) => m.sender_id === uid);
  const canWrite = c.status !== 'declined' && !c.is_request_for_me && !(c.i_sent_request && iSentAMessage);
  const lastMine = list.find((m) => m.sender_id === uid);
  const seen = lastMine && c.status === 'active' && new Date(c.other_last_read_at) >= new Date(lastMine.created_at);
  const onError = (e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e)));

  const sendNow = () => {
    const text = body.trim();
    if (!text) return;
    send.mutate(text, { onSuccess: () => setBody(''), onError });
  };

  const confirmBlock = () =>
    Alert.alert(t('profile.blockTitle', { username: c.other_username }), t('profile.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.block'),
        style: 'destructive',
        onPress: () => block.mutate(c.other_id, { onSuccess: () => router.back(), onError }),
      },
    ]);

  const chatMenu = () =>
    Alert.alert(c.other_display_name, undefined, [
      { text: t('report.reportUser', { username: c.other_username }), onPress: () => openReport('user', c.other_id) },
      { text: t('profile.block'), style: 'destructive', onPress: confirmBlock },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const openProfile = () => router.push({ pathname: '/user/[username]', params: { username: c.other_username } });

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={`@${c.other_username}`} onPress={openProfile} style={styles.headerTitle}>
              <Avatar uri={avatarUrl(c.other_avatar_path)} name={c.other_display_name} size={30} />
              <AppText variant="bodyStrong" numberOfLines={1}>
                {c.other_display_name}
              </AppText>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.options')} onPress={chatMenu} style={styles.headerButton}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {c.is_request_for_me ? (
          <View style={styles.banner}>
            <AppText variant="bodyStrong">{t('chat.requestTitle', { name: c.other_display_name })}</AppText>
            <AppText variant="callout" color="textSecondary">
              {t('chat.requestBody')}
            </AppText>
            <View style={styles.bannerActions}>
              <Button
                label={t('chat.accept')}
                compact
                style={styles.flex}
                loading={respond.isPending && respond.variables === true}
                onPress={() => respond.mutate(true, { onError })}
              />
              <Button
                label={t('chat.decline')}
                variant="secondary"
                compact
                style={styles.flex}
                loading={respond.isPending && respond.variables === false}
                onPress={() => respond.mutate(false, { onSuccess: () => router.back(), onError })}
              />
            </View>
          </View>
        ) : null}

        {messages.isPending ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : (
          <FlatList
            inverted
            data={list}
            keyExtractor={(m) => m.id}
            onEndReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
            }}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <AppText color="textSecondary" center>
                  {t('chat.sayHello')}
                </AppText>
                <AppText variant="caption" color="textSecondary" center>
                  {t('chat.privacy', { name: c.other_display_name })}
                </AppText>
              </View>
            }
            renderItem={({ item }) => (
              <Bubble
                message={item}
                mine={item.sender_id === uid}
                time={ago(item.created_at)}
                seen={!!seen && item.id === lastMine?.id}
                onReport={() =>
                  Alert.alert(t('report.reportMessage'), undefined, [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('report.action'), style: 'destructive', onPress: () => openReport('message', item.id) },
                  ])
                }
                onUnsend={() =>
                  Alert.alert(t('chat.unsendTitle'), undefined, [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('chat.unsend'), style: 'destructive', onPress: () => unsend.mutate(item.id, { onError }) },
                  ])
                }
              />
            )}
          />
        )}

        {c.status === 'declined' ? (
          <AppText color="textSecondary" center style={styles.notice}>
            {t('chat.declined')}
          </AppText>
        ) : c.i_sent_request && iSentAMessage ? (
          <AppText color="textSecondary" center style={styles.notice}>
            {t('chat.pending', { name: c.other_display_name })}
          </AppText>
        ) : null}

        {canWrite ? (
          <View style={styles.inputBar}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t('chat.placeholder')}
              placeholderTextColor={colors.textDisabled}
              selectionColor={colors.accent}
              style={styles.input}
              multiline
              maxLength={2000}
              accessibilityLabel={t('chat.placeholder')}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('chat.send')}
              onPress={sendNow}
              disabled={!body.trim() || send.isPending}
              style={[styles.sendButton, (!body.trim() || send.isPending) && styles.sendDisabled]}
            >
              {send.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  message,
  mine,
  time,
  seen,
  onUnsend,
  onReport,
}: {
  message: Message;
  mine: boolean;
  time: string;
  seen: boolean;
  onUnsend: () => void;
  onReport: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <Pressable
        onLongPress={mine ? onUnsend : onReport}
        accessibilityHint={mine ? t('chat.unsend') : t('report.reportMessage')}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
      >
        <AppText>{message.body}</AppText>
      </Pressable>
      <AppText variant="caption" color="textSecondary" style={styles.meta}>
        {time}
        {seen ? ` · ${t('chat.seen')}` : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  flex: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: 220 },
  headerButton: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center' },
  banner: {
    margin: spacing.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  loading: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.xs, flexGrow: 1 },
  emptyChat: { flex: 1, justifyContent: 'center', gap: spacing.xs, transform: [{ scaleY: -1 }] },
  bubbleRow: { alignItems: 'flex-start', gap: 2 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '80%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { backgroundColor: colors.bgSecondary, borderBottomLeftRadius: radius.sm },
  meta: { paddingHorizontal: spacing.xxs },
  notice: { padding: spacing.md },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: hitSize,
    maxHeight: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    width: hitSize,
    height: hitSize,
    borderRadius: hitSize / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
