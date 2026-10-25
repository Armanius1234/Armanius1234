import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { latestClaimFor, useMyClaims, useSignedUrls, useVehicle } from '@/features/garage/api';
import { PlateBadge, StatusPill, VerifiedBadge } from '@/features/garage/components';
import { useProfileById } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import { avatarUrl } from '@/lib/supabase';
import { vehicleTitle } from '@/shared/vehicle';
import { colors, hitSize, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, EmptyView, ErrorView, LoadingView } from '@/ui';

const LIVE = ['not_verified', 'pending', 'verified'];

export default function VehicleProfileScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuth().session?.user.id;
  const vehicle = useVehicle(String(id));
  const isMine = !!vehicle.data && vehicle.data.owner_id === uid;
  const owner = useProfileById(vehicle.data && !isMine ? vehicle.data.owner_id : undefined);
  const claims = useMyClaims();
  const urls = useSignedUrls(
    'vehicle-photos',
    (vehicle.data?.vehicle_images ?? []).map((i) => i.storage_path),
  );
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  if (vehicle.isPending) return <LoadingView />;
  if (vehicle.isError) return <ErrorView onRetry={() => void vehicle.refetch()} retrying={vehicle.isFetching} />;
  if (!vehicle.data) return <EmptyView icon="car-sport-outline" title={t('vehicle.notFound')} />;

  const v = vehicle.data;
  const images = v.vehicle_images;
  const claim = isMine ? latestClaimFor(claims.data, v.id) : undefined;
  const liveClaim = claim && LIVE.includes(claim.status) ? claim : undefined;
  const photoHeight = Math.round((width * 3) / 4);

  const details: [string, string][] = [
    [t('vehicle.year'), String(v.model_year)],
    ...(v.generation ? ([[t('vehicle.generation'), v.generation]] as [string, string][]) : []),
    ...(v.color ? ([[t('vehicle.color'), v.color]] as [string, string][]) : []),
    ...(v.horsepower ? ([[t('vehicle.horsepower'), t('vehicle.ps', { hp: v.horsepower })]] as [string, string][]) : []),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: isMine
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('vehicle.edit')}
                  onPress={() => router.push({ pathname: '/vehicle/[id]/edit', params: { id: v.id } })}
                  style={styles.headerButton}
                >
                  <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={vehicle.isRefetching}
            onRefresh={() => {
              void vehicle.refetch();
              if (isMine) void claims.refetch();
            }}
            tintColor={colors.accent}
          />
        }
      >
        {/* Photos */}
        {images.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
            >
              {images.map((img) => (
                <View key={img.id} style={[styles.photo, { width, height: photoHeight }]}>
                  {urls.data?.[img.storage_path] ? (
                    <Image
                      source={{ uri: urls.data[img.storage_path] }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : null}
                </View>
              ))}
            </ScrollView>
            {images.length > 1 ? (
              <View style={styles.dots}>
                {images.map((img, i) => (
                  <View key={img.id} style={[styles.dot, i === page && styles.dotActive]} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.photo, styles.noPhoto, { width, height: photoHeight * 0.6 }]}>
            <Ionicons name="car-sport-outline" size={48} color={colors.textDisabled} />
            {isMine ? (
              <Button
                label={t('vehicle.takePhoto')}
                variant="secondary"
                compact
                onPress={() => router.push({ pathname: '/vehicle/[id]/edit', params: { id: v.id } })}
              />
            ) : (
              <AppText color="textSecondary">{t('vehicle.noPhotos')}</AppText>
            )}
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.titleBlock}>
            <AppText variant="title">{vehicleTitle(v)}</AppText>
            {v.is_verified ? <VerifiedBadge label={t('plate.verifiedBadge')} /> : null}
          </View>

          {/* Owner */}
          {!isMine && owner.data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`@${owner.data.username}`}
              onPress={() => router.push({ pathname: '/user/[username]', params: { username: owner.data!.username } })}
              style={styles.ownerRow}
            >
              <Avatar uri={avatarUrl(owner.data.avatar_path)} name={owner.data.display_name} size={40} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{owner.data.display_name}</AppText>
                <AppText variant="callout" color="textSecondary">
                  @{owner.data.username}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} />
            </Pressable>
          ) : null}

          {/* Plate (owner only) */}
          {isMine ? (
            <View style={styles.card}>
              <AppText variant="overline" color="textSecondary">
                {t('plate.title').toUpperCase()}
              </AppText>
              {liveClaim ? (
                <>
                  <View style={styles.plateRow}>
                    <PlateBadge plate={liveClaim.plate} />
                    <StatusPill status={liveClaim.status} />
                  </View>
                  <Button
                    label={t('plate.manage')}
                    variant="secondary"
                    compact
                    onPress={() => router.push({ pathname: '/vehicle/[id]/plate', params: { id: v.id } })}
                  />
                </>
              ) : (
                <>
                  <AppText color="textSecondary">{t('plate.claimBody')}</AppText>
                  {claim ? <StatusPill status={claim.status} /> : null}
                  <Button
                    label={claim ? t('plate.claimNew') : t('plate.claimTitle')}
                    compact
                    onPress={() => router.push({ pathname: '/vehicle/[id]/plate', params: { id: v.id } })}
                  />
                </>
              )}
            </View>
          ) : null}

          {/* Details */}
          <View style={styles.card}>
            <AppText variant="overline" color="textSecondary">
              {t('vehicle.details').toUpperCase()}
            </AppText>
            {details.map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <AppText color="textSecondary">{label}</AppText>
                <AppText variant="bodyStrong">{value}</AppText>
              </View>
            ))}
          </View>

          {v.modifications ? (
            <View style={styles.section}>
              <AppText variant="heading">{t('vehicle.modifications')}</AppText>
              <AppText color="textSecondary">{v.modifications}</AppText>
            </View>
          ) : null}
          {v.description ? (
            <View style={styles.section}>
              <AppText variant="heading">{t('vehicle.description')}</AppText>
              <AppText color="textSecondary">{v.description}</AppText>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  headerButton: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center' },
  photo: { backgroundColor: colors.bgElevated },
  noPhoto: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accent, width: 16 },
  body: { padding: spacing.md, gap: spacing.md },
  titleBlock: { gap: spacing.xxs },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  section: { gap: spacing.xs },
});
