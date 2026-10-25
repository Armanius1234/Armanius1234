import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useCreateProfile, useUpdateSettings } from '@/features/profile/api';
import { pickAvatar, removeAvatar, uploadAvatar } from '@/features/profile/avatar';
import { AvatarPicker, StepHeader, UsernameField } from '@/features/profile/components';
import { useUsernameCheck } from '@/features/profile/useUsernameCheck';
import { useI18n } from '@/i18n';
import type { MessagingPolicy } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { avatarUrl } from '@/lib/supabase';
import { bioSchema, citySchema, displayNameSchema, usernameSchema } from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, ChoiceGroup, FormMessage, Screen, Section, SwitchRow, TextField } from '@/ui';

const TOTAL = 3;

export default function OnboardingScreen() {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const uid = session?.user.id ?? '';
  const createProfile = useCreateProfile();
  const updateSettings = useUpdateSettings();

  const [step, setStep] = useState(1);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | undefined>();
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [aboutErrors, setAboutErrors] = useState<{ bio?: string; city?: string }>({});
  const [isPrivate, setIsPrivate] = useState(false);
  const [messaging, setMessaging] = useState<MessagingPolicy>('everyone');
  const [formError, setFormError] = useState<string | null>(null);

  const usernameStatus = useUsernameCheck(username);

  function nextFromIdentity() {
    setFormError(null);
    const name = displayNameSchema.safeParse(displayName);
    setDisplayNameError(name.success ? undefined : t('errors.display_name_length'));
    if (usernameStatus.state !== 'available' || !name.success) return;
    setStep(2);
  }

  function nextFromAbout() {
    const b = bioSchema.safeParse(bio);
    const c = citySchema.safeParse(city);
    setAboutErrors({
      bio: b.success ? undefined : t('errors.bio_length'),
      city: c.success ? undefined : t('errors.city_length'),
    });
    if (b.success && c.success) setStep(3);
  }

  async function choosePhoto() {
    setFormError(null);
    try {
      const local = await pickAvatar();
      if (!local) return;
      setUploading(true);
      const path = await uploadAvatar(uid, local);
      const previous = avatarPath;
      setAvatarPath(path);
      void removeAvatar(previous).catch(() => undefined);
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setUploading(false);
    }
  }

  async function finish() {
    setFormError(null);
    const parsedUsername = usernameSchema.safeParse(username);
    const parsedName = displayNameSchema.safeParse(displayName);
    if (!parsedUsername.success || !parsedName.success) {
      setStep(1);
      return;
    }
    try {
      if (messaging !== 'everyone') {
        await updateSettings.mutateAsync({ messaging_policy: messaging });
      }
      await createProfile.mutateAsync({
        username: parsedUsername.data,
        display_name: parsedName.data,
        bio: bio.trim(),
        city: citySchema.parse(city),
        avatar_path: avatarPath,
        is_private: isPrivate,
      });
      // The profile now exists; navigation moves to the app automatically.
    } catch (e) {
      const key = errorKey(e);
      if (key === 'errors.username_taken') setStep(1);
      setFormError(t(key));
    }
  }

  const busy = createProfile.isPending || updateSettings.isPending;

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.footerRow}>
          {step > 1 ? (
            <Button label={t('common.back')} variant="secondary" onPress={() => setStep(step - 1)} style={styles.back} />
          ) : null}
          {step === 1 ? (
            <Button
              label={t('common.continue')}
              onPress={nextFromIdentity}
              disabled={usernameStatus.state !== 'available'}
              style={styles.flex}
            />
          ) : step === 2 ? (
            <Button label={t('common.continue')} onPress={nextFromAbout} disabled={uploading} style={styles.flex} />
          ) : (
            <Button label={t('onboarding.finish')} onPress={finish} loading={busy} style={styles.flex} />
          )}
        </View>
      }
    >
      {step === 1 ? (
        <>
          <StepHeader
            current={1}
            total={TOTAL}
            title={t('onboarding.identityTitle')}
            subtitle={t('onboarding.identitySubtitle')}
          />
          <UsernameField value={username} onChange={setUsername} status={usernameStatus} />
          <TextField
            label={t('onboarding.displayName')}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={50}
            autoComplete="name"
            error={displayNameError}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <StepHeader current={2} total={TOTAL} title={t('onboarding.aboutTitle')} subtitle={t('onboarding.aboutSubtitle')} />
          <AvatarPicker
            uri={avatarUrl(avatarPath)}
            name={displayName}
            busy={uploading}
            onPick={choosePhoto}
            onRemove={() => {
              void removeAvatar(avatarPath).catch(() => undefined);
              setAvatarPath(null);
            }}
          />
          <TextField
            label={`${t('onboarding.bio')} (${t('common.optional')})`}
            value={bio}
            onChangeText={setBio}
            placeholder={t('onboarding.bioPlaceholder')}
            multiline
            maxLength={300}
            error={aboutErrors.bio}
          />
          <TextField
            label={`${t('onboarding.city')} (${t('common.optional')})`}
            value={city}
            onChangeText={setCity}
            maxLength={60}
            hint={t('onboarding.cityHint')}
            error={aboutErrors.city}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <StepHeader
            current={3}
            total={TOTAL}
            title={t('onboarding.privacyTitle')}
            subtitle={t('onboarding.privacySubtitle')}
          />
          <Section>
            <SwitchRow
              label={t('privacy.privateAccount')}
              hint={t('privacy.privateAccountHint')}
              value={isPrivate}
              onChange={setIsPrivate}
            />
          </Section>
          <Section title={t('privacy.messagingTitle')} footer={t('privacy.messagingHint')}>
            <ChoiceGroup
              value={messaging}
              onChange={setMessaging}
              options={[
                { value: 'everyone', label: t('privacy.messagingEveryone') },
                { value: 'followers', label: t('privacy.messagingFollowers') },
                { value: 'nobody', label: t('privacy.messagingNobody') },
              ]}
            />
          </Section>
          <AppText variant="caption" color="textSecondary">
            {t('privacy.plateNote')}
          </AppText>
        </>
      ) : null}

      <FormMessage message={formError} />
      {step === 1 ? <Button label={t('auth.signOut')} variant="ghost" onPress={() => void signOut()} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, gap: spacing.md },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
  back: { minWidth: 110 },
  flex: { flex: 1 },
});
