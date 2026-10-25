import { StyleSheet } from 'react-native';

import { useMyProfile, useMySettings, useUpdateProfile, useUpdateSettings } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import type { MessagingPolicy } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, ChoiceGroup, ErrorView, FormMessage, LoadingView, Screen, Section, SwitchRow } from '@/ui';

export default function PrivacySettingsScreen() {
  const { t } = useI18n();
  const profile = useMyProfile();
  const settings = useMySettings();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateSettings();

  if (profile.isPending || settings.isPending) return <LoadingView />;
  if (profile.isError || settings.isError || !profile.data || !settings.data) {
    return (
      <ErrorView
        onRetry={() => {
          void profile.refetch();
          void settings.refetch();
        }}
      />
    );
  }

  const error = updateProfile.error ?? updateSettings.error;

  return (
    <Screen scroll edges={['bottom']} contentStyle={styles.content}>
      <Section>
        <SwitchRow
          label={t('privacy.privateAccount')}
          hint={t('privacy.privateAccountHint')}
          value={profile.data.is_private}
          disabled={updateProfile.isPending}
          onChange={(v) => updateProfile.mutate({ is_private: v })}
        />
      </Section>

      <Section title={t('privacy.messagingTitle')} footer={t('privacy.messagingHint')}>
        <ChoiceGroup<MessagingPolicy>
          value={settings.data.messaging_policy}
          disabled={updateSettings.isPending}
          onChange={(v) => updateSettings.mutate({ messaging_policy: v })}
          options={[
            { value: 'everyone', label: t('privacy.messagingEveryone') },
            { value: 'followers', label: t('privacy.messagingFollowers') },
            { value: 'nobody', label: t('privacy.messagingNobody') },
          ]}
        />
      </Section>

      <FormMessage message={error ? t(errorKey(error)) : null} />

      <AppText variant="caption" color="textSecondary">
        {t('privacy.plateNote')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.lg },
});
