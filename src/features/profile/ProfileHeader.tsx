import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useMyClaims, useSignedUrls, useVehicles, type VehicleWithImages } from '@/features/garage/api';
import { PlateBadge } from '@/features/garage/components';
import { useI18n } from '@/i18n';
import type { Profile } from '@/lib/database.types';
import { avatarUrl } from '@/lib/supabase';
import { isValidSocialUrl, type SocialNetwork } from '@/shared/validation';
import { colors, hitSize, radius, spacing } from '@/theme/tokens';
import { AppText, Avatar } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const SOCIALS: { network: SocialNetwork; field: keyof Profile; icon: IconName }[] = [
  { network: 'instagram', field: 'instagram_url', icon: 'logo-instagram' },
  { network: 'tiktok', field: 'tiktok_url', icon: 'logo-tiktok' },
  { network: 'linkedin', field: 'linkedin_url', icon: 'logo-linkedin' },
  { network: 'facebook', field: 'facebook_url', icon: 'logo-facebook' },
];

const COVER_HEIGHT = 220;

/** The car a profile is shown with: a verified one with photos first. */
export function mainVehicle(vehicles: VehicleWithImages[] | undefined): VehicleWithImages | undefined {
  if (!vehicles?.length) return undefined;
  const score = (v: VehicleWithImages) => (v.is_verified ? 2 : 0) + (v.vehicle_images.length ? 1 : 0);
  return [...vehicles].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Profile top, like the PL8TE design: the car photo as cover, the plate,
 * name, car, place, numbers, buttons and social links.
 *
 * The plate itself is only shown to its owner (plates are private). Other
 * people see "verified car" instead.
 */
export function ProfileHeader({
  profile,
  actions,
  stats,
  isMe,
}: {
  profile: Profile;
  actions?: ReactNode;
  stats?: ReactNode;
  isMe: boolean;
}) {
  const { t } = useI18n();
  const vehicles = useVehicles(profile.id);
  const car = mainVehicle(vehicles.data);
  const coverPath = car?.vehicle_images[0]?.storage_path;
  const cover = useSignedUrls('vehicle-photos', coverPath ? [coverPath] : []);
  const coverUrl = coverPath ? cover.data?.[coverPath] : undefined;
  const claims = useMyClaims();
  const plate = isMe && car ? claims.data?.find((c) => c.vehicle_id === car.id && c.status === 'verified')?.plate : undefined;

  const links = SOCIALS.flatMap((s) => {
    const url = profile[s.field];
    // Only open links that match the expected network (validated again here).
    return typeof url === 'string' && isValidSocialUrl(s.network, url) ? [{ ...s, url }] : [];
  });
  const carLine = car ? [car.make, car.model, car.generation].filter(Boolean).join(' ') : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.cover}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl, cacheKey: coverPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.coverEmpty}>
            <Avatar uri={avatarUrl(profile.avatar_path)} name={profile.display_name} size={96} />
          </View>
        )}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
          <Defs>
            <LinearGradient id="coverFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.45" stopColor={colors.bgPrimary} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.bgPrimary} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="1" height="1" fill="url(#coverFade)" />
        </Svg>
      </View>

      {plate ? (
        <View style={styles.plateRow}>
          <PlateBadge plate={plate} size="sm" />
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} accessibilityLabel={t('profile.verified')} />
        </View>
      ) : car?.is_verified ? (
        <View style={styles.plateRow}>
          <View style={styles.verifiedChip}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <AppText variant="caption">{t('profile.verifiedCar')}</AppText>
          </View>
        </View>
      ) : null}

      <View style={styles.info}>
        <View style={styles.inline}>
          {coverUrl ? <Avatar uri={avatarUrl(profile.avatar_path)} name={profile.display_name} size={36} /> : null}
          <AppText variant="title" numberOfLines={1} style={styles.shrink}>
            {profile.display_name}
          </AppText>
          {profile.is_private ? (
            <View style={styles.badge}>
              <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
              <AppText variant="caption" color="textSecondary">
                {t('profile.privateBadge')}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="callout" color="textSecondary">
          @{profile.username}
          {carLine ? ` · ${carLine}` : ''}
        </AppText>
        {profile.city ? (
          <View style={styles.inline}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <AppText variant="callout" color="textSecondary">
              {profile.city}
            </AppText>
          </View>
        ) : null}
        {profile.bio ? <AppText>{profile.bio}</AppText> : isMe ? <AppText color="textSecondary">{t('profile.noBio')}</AppText> : null}
      </View>

      {stats}

      {actions ? <View style={styles.actions}>{actions}</View> : null}

      {links.length > 0 ? (
        <View style={styles.socials}>
          {links.map((l) => (
            <Pressable
              key={l.network}
              accessibilityRole="link"
              accessibilityLabel={t(`profile.${l.network}`)}
              onPress={() => void Linking.openURL(l.url)}
              style={({ pressed }) => [styles.social, pressed && styles.socialPressed]}
            >
              <Ionicons name={l.icon} size={22} color={colors.textPrimary} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  // Edge to edge, like the design.
  cover: { height: COVER_HEIGHT, marginHorizontal: -spacing.md, marginTop: -spacing.md, overflow: 'hidden', backgroundColor: colors.bgSecondary },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSubtle },
  plateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: -spacing.xl },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  info: { gap: spacing.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shrink: { flexShrink: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  socials: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  social: { width: hitSize, height: hitSize, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  socialPressed: { backgroundColor: colors.bgElevated },
});
