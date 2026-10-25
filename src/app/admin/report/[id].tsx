import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useIsAdmin, useSignedUrls, type PrivateBucket } from '@/features/garage/api';
import { useReportsQueue, useResolveReport } from '@/features/moderation/api';
import { useI18n } from '@/i18n';
import type { ReportQueueItem } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function Preview({ item }: { item: ReportQueueItem }) {
  const { t } = useI18n();
  const p = item.preview ?? {};
  const bucket: PrivateBucket = item.target_type === 'vehicle' ? 'vehicle-photos' : 'post-media';
  const paths = strList(item.target_type === 'vehicle' ? p.photo_paths : p.media_paths);
  const urls = useSignedUrls(bucket, paths);

  return (
    <View style={styles.preview}>
      {item.target_type === 'user' ? (
        <View style={styles.userRow}>
          <Avatar uri={avatarUrl(str(p.avatar_path) || null)} name={str(p.display_name) || '?'} size={56} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{str(p.display_name)}</AppText>
            <AppText color="textSecondary">@{str(p.username)}</AppText>
          </View>
        </View>
      ) : null}
      {str(p.caption) || str(p.body) || str(p.bio) ? <AppText>{str(p.caption) || str(p.body) || str(p.bio)}</AppText> : null}
      {item.target_type === 'vehicle' ? <AppText variant="bodyStrong">{`${str(p.make)} ${str(p.model)}`}</AppText> : null}
      {p.removed === true || p.restricted === true ? (
        <AppText variant="caption" color="warning">
          {t('moderation.removed')}
        </AppText>
      ) : null}
      {paths.map((path) => (
        <View key={path} style={styles.photo}>
          {urls.data?.[path] ? <Image source={{ uri: urls.data[path] }} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
        </View>
      ))}
    </View>
  );
}

export default function ReportDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const admin = useIsAdmin();
  const queue = useReportsQueue(admin.data === true);
  const resolve = useResolveReport();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const item = queue.data?.find((r) => r.report_id === id);

  if (admin.isPending || queue.isPending) return <LoadingView />;
  if (!item) return <EmptyView icon="checkmark-done-outline" title={t('moderation.empty')} />;

  const run = (action: 'dismiss' | 'remove' | 'suspend') => {
    setError(null);
    if (action !== 'dismiss' && note.trim().length < 3) {
      setError(t('errors.reason_required'));
      return;
    }
    const go = () =>
      resolve.mutate(
        { reportId: item.report_id, action, note },
        {
          onSuccess: () => {
            Alert.alert(t('moderation.done'));
            router.back();
          },
          onError: (e) => setError(t(errorKey(e))),
        },
      );
    if (action === 'suspend') {
      Alert.alert(t('moderation.suspendTitle', { username: item.owner_username ?? '' }), t('moderation.suspendBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('moderation.suspend'), style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <AppText variant="title">{t(`report.reason_${item.reason}`)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {t(`report.target_${item.target_type}`)}
        {item.reporter_username ? ` · ${t('moderation.reportedBy', { username: item.reporter_username })}` : ''}
        {item.owner_username ? ` · ${t('moderation.owner', { username: item.owner_username })}` : ''}
      </AppText>
      {item.details ? <AppText color="textSecondary">“{item.details}”</AppText> : null}
      {item.open_reports > 1 ? (
        <AppText variant="callout" color="warning">
          {t('moderation.count', { n: item.open_reports })}
        </AppText>
      ) : null}

      <Preview item={item} />

      <TextField label={t('moderation.note')} value={note} onChangeText={setNote} multiline maxLength={1000} />
      <FormMessage message={error} />
      <Button label={t('moderation.dismiss')} variant="secondary" onPress={() => run('dismiss')} disabled={resolve.isPending} />
      {item.target_type !== 'user' ? (
        <Button label={t('moderation.remove')} onPress={() => run('remove')} loading={resolve.isPending} />
      ) : null}
      {item.owner_id ? (
        <Button label={t('moderation.suspend')} variant="destructive" onPress={() => run('suspend')} disabled={resolve.isPending} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.sm },
  flex: { flex: 1 },
  preview: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  photo: { height: 240, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgElevated },
});
