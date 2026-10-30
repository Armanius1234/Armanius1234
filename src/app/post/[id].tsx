import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, type AlertButton, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/features/auth/AuthProvider';
import { MentionSuggestions, MentionText } from '@/features/discovery/mentions';
import { openReport } from '@/features/moderation/api';
import { useAddComment, useComments, useDeleteComment, usePost } from '@/features/social/api';
import { PostCard, useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, fonts, hitSize, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, EmptyView, ErrorView, LoadingView } from '@/ui';

export default function PostScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const post = usePost(postId);
  const comments = useComments(postId);
  const add = useAddComment(postId);
  const remove = useDeleteComment(postId);
  const ago = useTimeAgo();
  const uid = useAuth().session?.user.id;
  const [body, setBody] = useState('');

  if (post.isPending) return <LoadingView />;
  if (post.isError) return <ErrorView onRetry={() => void post.refetch()} retrying={post.isFetching} />;
  if (!post.data) return <EmptyView icon="images-outline" title={t('post.notFound')} />;

  const send = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate(text, {
      onSuccess: () => setBody(''),
      onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={comments.data ?? []}
          keyExtractor={(c) => c.comment_id}
          refreshing={comments.isRefetching}
          onRefresh={() => {
            void post.refetch();
            void comments.refetch();
          }}
          ListHeaderComponent={
            <View>
              <PostCard key={post.data.post_id} post={post.data} />
              <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
                {t('post.comments').toUpperCase()}
              </AppText>
            </View>
          }
          ListEmptyComponent={
            comments.isPending ? undefined : (
              <AppText color="textSecondary" style={styles.empty}>
                {t('post.noComments')}
              </AppText>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => {
                const actions: AlertButton[] = [];
                if (item.can_delete) {
                  actions.push({
                    text: t('post.deleteComment'),
                    style: 'destructive',
                    onPress: () =>
                      remove.mutate(item.comment_id, {
                        onError: (e) => Alert.alert(t('states.errorTitle'), t(errorKey(e))),
                      }),
                  });
                }
                if (item.author_id !== uid) {
                  actions.push({ text: t('report.reportComment'), onPress: () => openReport('comment', item.comment_id) });
                }
                if (!actions.length) return;
                Alert.alert(t('post.commentOptions'), undefined, [...actions, { text: t('common.cancel'), style: 'cancel' }]);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.author_username}: ${item.body}`}
              accessibilityHint={t('post.commentOptions')}
              style={styles.comment}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`@${item.author_username}`}
                onPress={() => router.push({ pathname: '/user/[username]', params: { username: item.author_username } })}
              >
                <Avatar uri={avatarUrl(item.author_avatar_path)} name={item.author_display_name} size={32} />
              </Pressable>
              <View style={styles.commentBody}>
                <AppText variant="callout">
                  <AppText variant="callout" style={styles.bold}>
                    {item.author_username}{' '}
                  </AppText>
                  <MentionText text={item.body} />
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {ago(item.created_at)}
                </AppText>
              </View>
            </Pressable>
          )}
        />
        <View style={styles.mentionBar}>
          <MentionSuggestions text={body} onPick={setBody} />
        </View>
        <View style={styles.inputBar}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('post.addComment')}
            placeholderTextColor={colors.textDisabled}
            selectionColor={colors.accent}
            style={styles.input}
            multiline
            maxLength={1000}
            accessibilityLabel={t('post.addComment')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('post.send')}
            onPress={send}
            disabled={!body.trim() || add.isPending}
            style={styles.send}
          >
            <AppText variant="bodyStrong" color={body.trim() && !add.isPending ? 'accent' : 'textDisabled'}>
              {t('post.send')}
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mentionBar: { paddingHorizontal: spacing.md },
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  sectionTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  empty: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  comment: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  commentBody: { flex: 1, gap: 2 },
  bold: { fontFamily: fonts.semibold },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgPrimary,
  },
  input: {
    flex: 1,
    minHeight: hitSize,
    maxHeight: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  send: { minHeight: hitSize, justifyContent: 'center', paddingHorizontal: spacing.xs },
});
