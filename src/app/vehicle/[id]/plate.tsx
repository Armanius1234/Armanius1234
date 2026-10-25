import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  latestClaimFor,
  useClaimPlate,
  useMyClaims,
  useReleasePlate,
  useSetPlateSettings,
  useStartVerification,
  useVehicle,
} from '@/features/garage/api';
import { PlateBadge, PlateInput, StatusPill } from '@/features/garage/components';
import { useI18n, type TKey } from '@/i18n';
import type { PlateClaim } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { EMPTY_PLATE, plateError, type PlateParts } from '@/shared/plate';
import { vehicleTitle } from '@/shared/vehicle';
import { spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, FormMessage, LoadingView, Screen, Section, SwitchRow } from '@/ui';

const REVOKE_TEXT: Record<string, TKey> = {
  transfer: 'plate.revokedTransfer',
  owner_removed: 'plate.revokedOwner',
  admin: 'plate.revokedAdmin',
};

export default function PlateScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = String(id);
  const uid = useAuth().session?.user.id;
  const vehicle = useVehicle(vehicleId);
  const claims = useMyClaims();
  const [newClaim, setNewClaim] = useState(false);

  if (vehicle.isPending || claims.isPending) return <LoadingView />;
  if (vehicle.isError || claims.isError) {
    return (
      <ErrorView
        onRetry={() => {
          void vehicle.refetch();
          void claims.refetch();
        }}
      />
    );
  }
  if (!vehicle.data || vehicle.data.owner_id !== uid) {
    return <EmptyView icon="car-sport-outline" title={t('vehicle.notFound')} />;
  }

  const claim = latestClaimFor(claims.data, vehicleId);
  const isLive = !!claim && ['not_verified', 'pending', 'verified', 'rejected'].includes(claim.status);

  return (
    <>
      <Stack.Screen options={{ title: vehicleTitle(vehicle.data) }} />
      {isLive && claim && !(newClaim && claim.status === 'rejected') ? (
        <ManageClaim claim={claim} vehicleId={vehicleId} onClaimNew={() => setNewClaim(true)} />
      ) : (
        <ClaimForm vehicleId={vehicleId} previous={claim} />
      )}
    </>
  );
}

function ClaimForm({ vehicleId, previous }: { vehicleId: string; previous?: PlateClaim }) {
  const { t } = useI18n();
  const claim = useClaimPlate(vehicleId);
  const [plate, setPlate] = useState<PlateParts>(EMPTY_PLATE);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    const problem = plateError(plate);
    if (problem) {
      setError(t(`errors.plate_${problem}`));
      return;
    }
    setError(undefined);
    try {
      await claim.mutateAsync(plate);
    } catch (e) {
      setFormError(t(errorKey(e)));
    }
  }

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      {previous?.status === 'revoked' && previous.revoke_reason ? (
        <FormMessage message={t(REVOKE_TEXT[previous.revoke_reason] ?? 'plate.revokedOwner')} />
      ) : null}
      <AppText variant="title">{t('plate.claimTitle')}</AppText>
      <AppText color="textSecondary">{t('plate.claimBody')}</AppText>
      <PlateInput value={plate} onChange={setPlate} onSubmit={submit} error={error} disabled={claim.isPending} />
      <FormMessage message={formError} />
      <Button label={t('plate.claim')} onPress={submit} loading={claim.isPending} />
      <AppText variant="caption" color="textSecondary">
        {t('plate.accessNote')}
      </AppText>
    </Screen>
  );
}

function ManageClaim({
  claim,
  vehicleId,
  onClaimNew,
}: {
  claim: PlateClaim;
  vehicleId: string;
  onClaimNew: () => void;
}) {
  const { t } = useI18n();
  const start = useStartVerification();
  const settings = useSetPlateSettings(vehicleId);
  const release = useReleasePlate(vehicleId);
  const [formError, setFormError] = useState<string | null>(null);

  async function verify() {
    setFormError(null);
    try {
      await start.mutateAsync(claim.claim_id);
      router.push({ pathname: '/verification/[claimId]', params: { claimId: claim.claim_id } });
    } catch (e) {
      setFormError(t(errorKey(e)));
    }
  }

  function toggle(next: { discoverable?: boolean; showOwner?: boolean }) {
    setFormError(null);
    settings.mutate(
      {
        claimId: claim.claim_id,
        discoverable: next.discoverable ?? claim.discoverable,
        showOwner: next.showOwner ?? claim.show_owner,
      },
      { onError: (e) => setFormError(t(errorKey(e))) },
    );
  }

  function confirmRelease() {
    Alert.alert(t('plate.releaseTitle'), t('plate.releaseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plate.release'),
        style: 'destructive',
        onPress: () => release.mutate(claim.claim_id, { onError: (e) => setFormError(t(errorKey(e))) }),
      },
    ]);
  }

  const verified = claim.status === 'verified';
  const resumable = claim.request_status === 'awaiting_evidence';

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <View style={styles.plateHeader}>
        <PlateBadge plate={claim.plate} size="lg" />
        <StatusPill status={claim.status} />
      </View>

      {claim.status === 'not_verified' ? (
        <View style={styles.block}>
          <AppText color="textSecondary">{t('plate.notVerifiedBody')}</AppText>
          <Button label={resumable ? t('plate.continueVerify') : t('plate.verify')} onPress={verify} loading={start.isPending} />
        </View>
      ) : null}
      {claim.status === 'pending' ? <AppText color="textSecondary">{t('plate.pendingBody')}</AppText> : null}
      {claim.status === 'rejected' ? (
        <View style={styles.block}>
          <FormMessage message={t('plate.rejectedBody', { reason: claim.decision_note ?? '—' })} />
          <Button label={t('plate.tryAgain')} onPress={verify} loading={start.isPending} />
          <Button label={t('plate.claimNew')} variant="secondary" onPress={onClaimNew} />
        </View>
      ) : null}

      <Section footer={verified ? undefined : t('plate.discoverableLocked')}>
        <SwitchRow
          label={t('plate.discoverable')}
          hint={t('plate.discoverableHint')}
          value={claim.discoverable}
          disabled={!verified || settings.isPending}
          onChange={(v) => toggle({ discoverable: v })}
        />
        <SwitchRow
          label={t('plate.showOwner')}
          hint={t('plate.showOwnerHint')}
          value={claim.show_owner}
          disabled={settings.isPending || claim.status === 'rejected'}
          onChange={(v) => toggle({ showOwner: v })}
        />
      </Section>

      <FormMessage message={formError} />
      <AppText variant="caption" color="textSecondary">
        {t('plate.accessNote')}
      </AppText>
      {claim.status !== 'rejected' ? (
        <Button label={t('plate.release')} variant="ghost" onPress={confirmRelease} loading={release.isPending} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  plateHeader: { alignItems: 'flex-start', gap: spacing.sm },
  block: { gap: spacing.sm },
});
