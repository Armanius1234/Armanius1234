import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  useAddEvidence,
  useEvidenceFiles,
  useMyClaims,
  useRemoveEvidence,
  useSignedUrls,
  useSubmitVerification,
} from '@/features/garage/api';
import { PlateBadge } from '@/features/garage/components';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, FormMessage, LoadingView, Screen } from '@/ui';

const MAX_PHOTOS = 4;
const MIN_PHOTOS = 2;

export default function VerificationScreen() {
  const { t } = useI18n();
  const { claimId } = useLocalSearchParams<{ claimId: string }>();
  const claims = useMyClaims();
  const claim = claims.data?.find((c) => c.claim_id === claimId);
  const requestId = claim?.request_status === 'awaiting_evidence' ? claim.request_id : null;

  if (claims.isPending) return <LoadingView />;
  if (claims.isError) return <ErrorView onRetry={() => void claims.refetch()} retrying={claims.isFetching} />;
  if (!claim) return <EmptyView icon="document-outline" title={t('vehicle.notFound')} />;

  if (claim.status === 'pending' || claim.request_status === 'submitted') {
    return (
      <Screen contentStyle={styles.center} edges={['bottom']}>
        <EmptyView icon="time-outline" title={t('verification.submitted')} body={t('verification.submittedBody')} />
        <Button label={t('verification.backToCar')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!requestId || !claim.challenge_code) {
    return <EmptyView icon="document-outline" title={t('errors.invalid_state')} />;
  }

  return <EvidenceStep requestId={requestId} code={claim.challenge_code} plate={claim.plate} />;
}

function EvidenceStep({ requestId, code, plate }: { requestId: string; code: string; plate: string }) {
  const { t } = useI18n();
  const files = useEvidenceFiles(requestId);
  const paths = files.data ?? [];
  const urls = useSignedUrls('verification-evidence', paths);
  const add = useAddEvidence(requestId);
  const remove = useRemoveEvidence(requestId);
  const submit = useSubmitVerification();
  const [formError, setFormError] = useState<string | null>(null);

  function confirmRemove(path: string) {
    Alert.alert(t('vehicle.removePhoto'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('vehicle.removePhoto'),
        style: 'destructive',
        onPress: () => remove.mutate(path, { onError: (e) => setFormError(t(errorKey(e))) }),
      },
    ]);
  }

  async function send() {
    setFormError(null);
    try {
      await submit.mutateAsync(requestId);
    } catch (e) {
      setFormError(t(errorKey(e)));
    }
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        <Button
          label={t('verification.submit')}
          onPress={send}
          loading={submit.isPending}
          disabled={paths.length < MIN_PHOTOS || add.isPending}
        />
      }
    >
      <PlateBadge plate={plate} />

      <Step n={1} text={t('verification.step1')} />
      <View style={styles.codeBox} accessibilityLabel={`${t('verification.code')}: ${code.split('').join(' ')}`}>
        <AppText variant="caption" color="textSecondary">
          {t('verification.code').toUpperCase()}
        </AppText>
        <AppText style={styles.code} selectable>
          {code}
        </AppText>
      </View>

      <Step n={2} text={t('verification.step2')} />
      <View style={styles.grid}>
        {paths.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityLabel={t('vehicle.removePhoto')}
            onPress={() => confirmRemove(p)}
            style={styles.tile}
          >
            {urls.data?.[p] ? (
              <Image source={{ uri: urls.data[p] }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <ActivityIndicator color={colors.textSecondary} />
            )}
            <View style={styles.removeBadge}>
              <Ionicons name="close" size={14} color="#fff" />
            </View>
          </Pressable>
        ))}
        {paths.length < MAX_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('verification.takePhoto')}
            onPress={() => add.mutate(undefined, { onError: (e) => setFormError(t(errorKey(e))) })}
            disabled={add.isPending}
            style={[styles.tile, styles.addTile]}
          >
            {add.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={28} color={colors.accent} />
                <AppText variant="caption" color="accent">
                  {t('verification.takePhoto')}
                </AppText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
      <AppText variant="caption" color="textSecondary">
        {t('verification.photoCount', { n: paths.length })}
      </AppText>

      <Step n={3} text={t('verification.step3')} />
      <FormMessage message={formError} />
      <View style={styles.privacy}>
        <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={styles.flex}>
          {t('verification.privacy')}
        </AppText>
      </View>
      <AppText variant="caption" color="textSecondary">
        {t('plate.accessNote')}
      </AppText>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <AppText variant="caption">{n}</AppText>
      </View>
      <AppText style={styles.flex}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  center: { justifyContent: 'center', gap: spacing.md },
  flex: { flex: 1 },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  codeBox: {
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  code: { fontSize: 36, lineHeight: 44, letterSpacing: 4, fontFamily: fonts.bold, color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '47%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  addTile: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  removeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacy: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
});
