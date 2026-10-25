import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { usePost, useUpdateCaption } from '@/features/social/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { Button, EmptyView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

/** Edit the caption of your own post. Opened with ?id=<post id>. */
export default function EditPostScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id ?? '');
  const post = usePost(postId);

  if (post.isPending) return <LoadingView />;
  if (!post.data) return <EmptyView icon="images-outline" title={t('post.notFound')} />;
  // Remount the form when the post arrives so it starts with the saved caption.
  return <EditForm key={post.data.post_id} postId={postId} initial={post.data.caption} />;
}

function EditForm({ postId, initial }: { postId: string; initial: string }) {
  const { t } = useI18n();
  const update = useUpdateCaption(postId);
  const [caption, setCaption] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const changed = caption.trim() !== initial.trim();

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        <Button
          label={t('common.save')}
          disabled={!changed}
          loading={update.isPending}
          onPress={() => {
            setError(null);
            update.mutate(caption, { onSuccess: () => router.back(), onError: (e) => setError(t(errorKey(e))) });
          }}
        />
      }
    >
      <TextField
        label={t('post.caption')}
        value={caption}
        onChangeText={setCaption}
        placeholder={t('post.captionPlaceholder')}
        multiline
        maxLength={2200}
        autoFocus
        editable={!update.isPending}
      />
      <FormMessage message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
});
