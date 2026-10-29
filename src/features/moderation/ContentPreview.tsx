import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useSignedUrls, type PrivateBucket } from '@/features/garage/api';
import { useI18n } from '@/i18n';
import type { Json, ReportTarget } from '@/lib/database.types';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar } from '@/ui';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Reported content as moderators see it (photos through short-lived private links). */
export function ContentPreview({
  targetType,
  content,
}: {
  targetType: ReportTarget;
  content: { [key: string]: Json | undefined } | null;
}) {
  const { t } = useI18n();
  const p = content ?? {};
  const bucket: PrivateBucket = targetType === 'vehicle' ? 'vehicle-photos' : 'post-media';
  const paths = strList(targetType === 'vehicle' ? p.photo_paths : p.media_paths);
  const urls = useSignedUrls(bucket, paths);
  const text = str(p.caption) || str(p.body) || str(p.bio);

  return (
    <View style={styles.preview}>
      {targetType === 'user' ? (
        <View style={styles.userRow}>
          <Avatar uri={avatarUrl(str(p.avatar_path) || null)} name={str(p.display_name) || '?'} size={56} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{str(p.display_name)}</AppText>
            <AppText color="textSecondary">@{str(p.username)}</AppText>
          </View>
        </View>
      ) : null}
      {text ? <AppText>{text}</AppText> : null}
      {targetType === 'vehicle' ? <AppText variant="bodyStrong">{`${str(p.make)} ${str(p.model)}`}</AppText> : null}
      {p.removed === true || p.restricted === true ? (
        <AppText variant="caption" color="warning">
          {t('moderation.removed')}
        </AppText>
      ) : null}
      {paths.map((path) => (
        <View key={path} style={styles.photo}>
          {urls.data?.[path] ? (
            // Reported photos stay in memory only, never in the moderator's disk cache.
            <Image source={{ uri: urls.data[path] }} style={StyleSheet.absoluteFill} contentFit="contain" cachePolicy="memory" />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
