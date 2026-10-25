import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { useSuspendedUsers, useUnsuspendUser } from '@/features/moderation/api';
import { useTimeAgo } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { SuspendedUser } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, FormMessage, LoadingView, TextField } from '@/ui';

export default function SuspendedUsersScreen() {
  const { t } = useI18n();
  const admin = useIsAdmin();
  const isAdmin = admin.data === true;
  const list = useSuspendedUsers(isAdmin);
  const [open, setOpen] = useState<string | null>(null);

  if (admin.isPending) return <LoadingView />;
  if (!isAdmin) return <EmptyView icon="lock-closed-outline" title={t('errors.permission_denied')} />;
  if (list.isPending) return <LoadingView />;
  if (list.isError) return <ErrorView onRetry={() => void list.refetch()} retrying={list.isFetching} />;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.list}
      data={list.data}
      keyExtractor={(u) => u.user_id}
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
      ListEmptyComponent={<EmptyView icon="checkmark-done-outline" title={t('moderation.suspendedEmpty')} />}
      renderItem={({ item }) => (
        <Row item={item} open={open === item.user_id} onToggle={() => setOpen(open === item.user_id ? null : item.user_id)} />
      )}
    />
  );
}

function Row({ item, open, onToggle }: { item: SuspendedUser; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const ago = useTimeAgo();
  const lift = useUnsuspendUser();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    if (note.trim().length < 3) {
      setError(t('errors.reason_required'));
      return;
    }
    Alert.alert(t('moderation.liftTitle', { username: item.username }), t('moderation.liftBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.lift'),
        onPress: () =>
          lift.mutate(
            { userId: item.user_id, note },
            { onSuccess: () => Alert.alert(t('moderation.lifted')), onError: (e) => setError(t(errorKey(e))) },
          ),
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`@${item.username}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.row}
      >
        <Avatar uri={avatarUrl(item.avatar_path)} name={item.display_name} size={44} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{item.display_name}</AppText>
          <AppText variant="caption" color="textSecondary">
            @{item.username} · {t('moderation.suspendedSince', { time: ago(item.suspended_at) })}
          </AppText>
          {item.reason ? (
            <AppText variant="callout" color="textSecondary">
              “{item.reason}”
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {open ? (
        <View style={styles.form}>
          <TextField label={t('moderation.liftNote')} value={note} onChangeText={setNote} maxLength={1000} />
          <FormMessage message={error} />
          <Button label={t('moderation.lift')} variant="secondary" loading={lift.isPending} onPress={confirm} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  flex: { flex: 1, gap: 2 },
  form: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
