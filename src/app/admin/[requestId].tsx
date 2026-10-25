import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useDecideVerification, useIsAdmin, useSignedUrls, useVerificationQueue } from '@/features/garage/api';
import { PlateBadge } from '@/features/garage/components';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

export default function ReviewScreen() {
  const { t } = useI18n();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const admin = useIsAdmin();
  const queue = useVerificationQueue(admin.data === true);
  const item = queue.data?.find((q) => q.request_id === requestId);
  const photos = useSignedUrls('verification-evidence', item?.evidence_paths ?? []);
  const decide = useDecideVerification();
  const { width } = useWindowDimensions();
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  if (admin.isPending || queue.isPending) return <LoadingView />;
  if (!item) return <EmptyView icon="checkmark-done-outline" title={t('admin.empty')} />;

  function run(approve: boolean) {
    if (!item) return;
    setFormError(null);
    if (!approve && note.trim().length < 3) {
      setFormError(t('errors.reason_required'));
      return;
    }
    decide.mutate(
      { requestId: item.request_id, approve, note: note.trim() },
      {
        onSuccess: () => {
          Alert.alert(t('admin.decided'));
          router.back();
        },
        onError: (e) => setFormError(t(errorKey(e))),
      },
    );
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        <View style={styles.actions}>
          <Button
            label={t('admin.reject')}
            variant="destructive"
            style={styles.flex}
            onPress={() => run(false)}
            disabled={decide.isPending}
          />
          <Button label={t('admin.approve')} style={styles.flex} onPress={() => run(true)} loading={decide.isPending} />
        </View>
      }
    >
      <PlateBadge plate={item.plate} size="lg" />
      <View style={styles.codeRow}>
        <AppText color="textSecondary">{t('admin.expectedCode')}</AppText>
        <AppText style={styles.code}>{item.challenge_code}</AppText>
      </View>
      <AppText variant="bodyStrong">
        {vehicleTitle({ make: item.make, model: item.model })} · {item.model_year}
        {item.color ? ` · ${item.color}` : ''}
      </AppText>
      <AppText color="textSecondary">
        {t('admin.member')}: @{item.username}
      </AppText>

      {item.has_conflict ? (
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={18} color={colors.warning} />
          <AppText variant="callout" style={styles.flex}>
            {t('admin.conflict')}
          </AppText>
        </View>
      ) : null}

      <AppText variant="caption" color="textSecondary">
        {t('admin.checklist')}
      </AppText>

      {item.evidence_paths.length === 0 ? <AppText color="textSecondary">{t('admin.noPhotos')}</AppText> : null}
      {item.evidence_paths.map((p) => (
        <View key={p} style={[styles.photo, { height: (width - spacing.md * 2) * 0.75 }]}>
          {photos.data?.[p] ? (
            <Image source={{ uri: photos.data[p] }} style={StyleSheet.absoluteFill} contentFit="contain" />
          ) : (
            <ActivityIndicator color={colors.textSecondary} />
          )}
        </View>
      ))}

      <TextField
        label={t('admin.rejectReason')}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />
      <FormMessage message={formError} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { fontFamily: fonts.bold, fontSize: 24, letterSpacing: 3, color: colors.accent },
  warning: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  photo: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
