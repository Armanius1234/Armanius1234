import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CarSearchPanel, PeopleSearchPanel } from '@/features/discovery/components';
import { useSearchPlate, useSignedUrls } from '@/features/garage/api';
import { PlateBadge, PlateInput, VehicleCard } from '@/features/garage/components';
import { MessageButton } from '@/features/messaging/MessageButton';
import { useProfileByUsername } from '@/features/profile/api';
import { FollowButton } from '@/features/social/components';
import { useI18n } from '@/i18n';
import type { SearchResult } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { EMPTY_PLATE, normalizePlateDE, plateError, type PlateParts } from '@/shared/plate';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, FormMessage, Logo, Screen } from '@/ui';
import { Segmented } from '@/ui/Segmented';

type Mode = 'plate' | 'people' | 'cars';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'found'; result: SearchResult; plate: string }
  | { kind: 'not_found'; plate: string }
  | { kind: 'limited' };

export default function PlateSearchScreen() {
  const { t } = useI18n();
  const search = useSearchPlate();
  const [plate, setPlate] = useState<PlateParts>(EMPTY_PLATE);
  const [inputError, setInputError] = useState<string | undefined>();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [formError, setFormError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('plate');

  async function run() {
    setFormError(null);
    const problem = plateError(plate);
    if (problem) {
      setInputError(t(`errors.plate_${problem}`));
      return;
    }
    setInputError(undefined);
    const canonical = normalizePlateDE(plate)!;
    try {
      const result = await search.mutateAsync(plate);
      setOutcome(result ? { kind: 'found', result, plate: canonical } : { kind: 'not_found', plate: canonical });
    } catch (e) {
      const key = errorKey(e);
      if (key === 'errors.rate_limited') setOutcome({ kind: 'limited' });
      else setFormError(t(key));
    }
  }

  function reset() {
    setPlate(EMPTY_PLATE);
    setOutcome({ kind: 'idle' });
  }

  return (
    <Screen scroll edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title">{t('tabs.search')}</AppText>
        <Logo width={64} framed={false} />
      </View>
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plate', label: t('search.modePlate') },
          { value: 'people', label: t('search.modePeople') },
          { value: 'cars', label: t('search.modeCars') },
        ]}
      />
      {mode === 'people' ? <PeopleSearchPanel /> : null}
      {mode === 'cars' ? <CarSearchPanel /> : null}
      {mode === 'plate' ? (
        <>
        <AppText color="textSecondary">{t('search.subtitle')}</AppText>

        <PlateInput value={plate} onChange={setPlate} onSubmit={run} error={inputError} disabled={search.isPending} />
        <Button
          label={t('search.button')}
          onPress={run}
          loading={search.isPending}
          icon={<Ionicons name="search" size={18} color="#fff" />}
        />
        <FormMessage message={formError} />

        {outcome.kind === 'found' ? <ResultCard result={outcome.result} plate={outcome.plate} /> : null}
        {outcome.kind === 'not_found' ? (
          <View style={styles.state}>
            <PlateBadge plate={outcome.plate} size="sm" />
            <EmptyView icon="help-circle-outline" title={t('search.notFound')} body={t('search.notFoundBody')} />
          </View>
        ) : null}
        {outcome.kind === 'limited' ? (
          <View style={styles.state}>
            <EmptyView icon="hourglass-outline" title={t('search.limited')} body={t('search.limitedBody')} />
          </View>
        ) : null}
        {outcome.kind !== 'idle' ? <Button label={t('search.newSearch')} variant="ghost" onPress={reset} /> : null}

        <View style={styles.hint}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            {t('search.hint')}
          </AppText>
        </View>
        </>
      ) : null}
    </Screen>
  );
}

function ResultCard({ result, plate }: { result: SearchResult; plate: string }) {
  const { t } = useI18n();
  const cover = useSignedUrls('vehicle-photos', result.cover_path ? [result.cover_path] : []);

  return (
    <View style={styles.result}>
      <PlateBadge plate={plate} size="sm" />
      <VehicleCard
        vehicle={{ ...result, is_verified: true }}
        coverUrl={result.cover_path ? cover.data?.[result.cover_path] : null}
        coverPath={result.cover_path}
        onPress={
          result.vehicle_id
            ? () => router.push({ pathname: '/vehicle/[id]', params: { id: result.vehicle_id! } })
            : undefined
        }
        footer={
          result.color ? (
            <AppText variant="caption" color="textSecondary">
              {result.color}
            </AppText>
          ) : null
        }
      />

      {result.owner_username ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('search.viewOwner')}
          onPress={() => router.push({ pathname: '/user/[username]', params: { username: result.owner_username! } })}
          style={styles.owner}
        >
          <Avatar uri={avatarUrl(result.owner_avatar_path)} name={result.owner_display_name ?? '?'} size={40} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{result.owner_display_name}</AppText>
            <AppText variant="callout" color="textSecondary">
              @{result.owner_username}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
        </Pressable>
      ) : (
        <AppText variant="callout" color="textSecondary">
          {t('search.ownerHidden')}
        </AppText>
      )}

      {result.vehicle_id ? (
        <Button
          label={t('search.viewVehicle')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: result.vehicle_id! } })}
        />
      ) : (
        <AppText variant="caption" color="textSecondary">
          {t('search.privateGarage')}
        </AppText>
      )}
      {result.owner_username ? <OwnerActions username={result.owner_username} /> : null}
    </View>
  );
}

/** Follow / message the owner (only when they chose to be shown). */
function OwnerActions({ username }: { username: string }) {
  const profile = useProfileByUsername(username);
  if (!profile.data) return null;
  return (
    <View style={styles.ownerActions}>
      <FollowButton profile={profile.data} />
      <MessageButton userId={profile.data.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  flex: { flex: 1 },
  state: { minHeight: 240, alignItems: 'center', gap: spacing.sm },
  result: { gap: spacing.sm },
  owner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerActions: { flexDirection: 'row', gap: spacing.sm },
  hint: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.sm },
});
