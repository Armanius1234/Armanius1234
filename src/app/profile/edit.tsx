import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile, useUpdateProfile } from '@/features/profile/api';
import { pickAvatar, removeAvatar, uploadAvatar } from '@/features/profile/avatar';
import { AvatarPicker, UsernameField } from '@/features/profile/components';
import { useUsernameCheck } from '@/features/profile/useUsernameCheck';
import { useI18n } from '@/i18n';
import type { Profile } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import {
  bioSchema,
  citySchema,
  displayNameSchema,
  normalizeSocialUrl,
  usernameSchema,
  type SocialNetwork,
} from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, ErrorView, FormMessage, LoadingView, Screen, TextField } from '@/ui';

export default function EditProfileScreen() {
  const profile = useMyProfile();
  if (profile.isPending) return <LoadingView />;
  if (profile.isError || !profile.data) {
    return <ErrorView onRetry={() => void profile.refetch()} retrying={profile.isFetching} />;
  }
  return <EditProfileForm profile={profile.data} />;
}

const NETWORKS: SocialNetwork[] = ['instagram', 'tiktok', 'linkedin', 'facebook'];
type SocialState = Record<SocialNetwork, string>;
type Errors = Partial<Record<'displayName' | 'bio' | 'city' | SocialNetwork, string>>;

function EditProfileForm({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const uid = useAuth().session?.user.id ?? '';
  const update = useUpdateProfile();

  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [city, setCity] = useState(profile.city ?? '');
  const [avatarPath, setAvatarPath] = useState(profile.avatar_path);
  const [uploading, setUploading] = useState(false);
  const [socials, setSocials] = useState<SocialState>({
    instagram: profile.instagram_url ?? '',
    tiktok: profile.tiktok_url ?? '',
    linkedin: profile.linkedin_url ?? '',
    facebook: profile.facebook_url ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const usernameStatus = useUsernameCheck(username, profile.username);
  // Files uploaded in this session that are not the saved avatar; removed if replaced.
  const [pendingUploads, setPendingUploads] = useState<string[]>([]);

  async function choosePhoto() {
    setFormError(null);
    try {
      const local = await pickAvatar();
      if (!local) return;
      setUploading(true);
      const path = await uploadAvatar(uid, local);
      setPendingUploads((p) => [...p, path]);
      setAvatarPath(path);
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setFormError(null);
    const next: Errors = {};
    const name = displayNameSchema.safeParse(displayName);
    if (!name.success) next.displayName = t('errors.display_name_length');
    const b = bioSchema.safeParse(bio);
    if (!b.success) next.bio = t('errors.bio_length');
    const c = citySchema.safeParse(city);
    if (!c.success) next.city = t('errors.city_length');

    const urls = {} as Record<SocialNetwork, string | null>;
    for (const n of NETWORKS) {
      const normalized = normalizeSocialUrl(n, socials[n]);
      if (normalized === null) next[n] = t(`errors.url_${n}`);
      urls[n] = normalized === '' ? null : normalized;
    }
    const u = usernameSchema.safeParse(username);
    setErrors(next);
    if (Object.keys(next).length > 0 || !u.success || usernameStatus.state !== 'available') return;

    try {
      await update.mutateAsync({
        username: u.data,
        display_name: name.data!,
        bio: bio.trim(),
        city: c.data ?? null,
        avatar_path: avatarPath,
        instagram_url: urls.instagram,
        tiktok_url: urls.tiktok,
        linkedin_url: urls.linkedin,
        facebook_url: urls.facebook,
      });
      // Clean up files that are no longer used.
      const unused = [...pendingUploads, profile.avatar_path].filter(
        (p): p is string => !!p && p !== avatarPath,
      );
      for (const p of unused) void removeAvatar(p).catch(() => undefined);
      router.back();
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
          label={t('common.save')}
          onPress={save}
          loading={update.isPending}
          disabled={uploading || usernameStatus.state === 'checking'}
        />
      }
    >
      <AvatarPicker
        uri={avatarUrl(avatarPath)}
        name={displayName}
        busy={uploading}
        onPick={choosePhoto}
        onRemove={() => setAvatarPath(null)}
      />
      <UsernameField value={username} onChange={setUsername} status={usernameStatus} />
      <TextField
        label={t('onboarding.displayName')}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={50}
        error={errors.displayName}
      />
      <TextField
        label={t('onboarding.bio')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('onboarding.bioPlaceholder')}
        multiline
        maxLength={300}
        error={errors.bio}
      />
      <TextField
        label={`${t('onboarding.city')} (${t('common.optional')})`}
        value={city}
        onChangeText={setCity}
        maxLength={60}
        hint={t('onboarding.cityHint')}
        error={errors.city}
      />
      <AppText variant="heading" style={styles.sectionTitle}>
        {t('profile.socialLinks')}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {t('profile.socialHint')}
      </AppText>
      {NETWORKS.map((n) => (
        <TextField
          key={n}
          label={`${t(`profile.${n}`)} (${t('common.optional')})`}
          value={socials[n]}
          onChangeText={(v) => setSocials((s) => ({ ...s, [n]: v }))}
          autoCapitalize="none"
          keyboardType="url"
          error={errors[n]}
        />
      ))}
      <FormMessage message={formError} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  sectionTitle: { marginTop: spacing.sm },
});
