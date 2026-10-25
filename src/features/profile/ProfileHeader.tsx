import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

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

export function ProfileHeader({ profile, actions }: { profile: Profile; actions?: ReactNode }) {
  const { t } = useI18n();
  const links = SOCIALS.flatMap((s) => {
    const url = profile[s.field];
    // Only open links that match the expected network (validated again here).
    return typeof url === 'string' && isValidSocialUrl(s.network, url) ? [{ ...s, url }] : [];
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Avatar uri={avatarUrl(profile.avatar_path)} name={profile.display_name} size={88} />
        <View style={styles.names}>
          <AppText variant="title" numberOfLines={1}>
            {profile.display_name}
          </AppText>
          <View style={styles.inline}>
            <AppText color="textSecondary">@{profile.username}</AppText>
            {profile.is_private ? (
              <View style={styles.badge}>
                <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
                <AppText variant="caption" color="textSecondary">
                  {t('profile.privateBadge')}
                </AppText>
              </View>
            ) : null}
          </View>
          {profile.city ? (
            <View style={styles.inline}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <AppText variant="callout" color="textSecondary">
                {profile.city}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      <AppText color={profile.bio ? 'textPrimary' : 'textSecondary'}>{profile.bio || t('profile.noBio')}</AppText>

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
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  names: { flex: 1, gap: spacing.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: spacing.xs,
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
