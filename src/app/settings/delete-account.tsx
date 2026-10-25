import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { deleteMyAccount } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { accountProvider } from '@/features/auth/social';
import { useMyProfile } from '@/features/profile/api';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

const PROVIDER_NAME = { apple: 'Apple', google: 'Google' } as const;

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const user = useAuth().session?.user;
  const email = user?.email ?? '';
  const provider = accountProvider(user?.app_metadata);
  const username = useMyProfile().data?.username ?? '';
  const [secret, setSecret] = useState(''); // password, or the username for Apple / Google accounts
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    if (!secret) {
      setError(t('errors.required'));
      return;
    }
    if (provider !== 'email' && secret.trim().toLowerCase() !== username.toLowerCase()) {
      setError(t('errors.username_mismatch'));
      return;
    }
    Alert.alert(t('account.deleteConfirmTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteRow'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          // On success the session ends and the app returns to the welcome screen.
          deleteMyAccount(provider === 'email' ? { kind: 'password', email, password: secret } : { kind: 'social' })
            .catch((e: unknown) => setError(t(errorKey(e))))
            .finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={<Button label={busy ? t('account.deleting') : t('account.deleteButton')} variant="destructive" onPress={confirm} loading={busy} />}
    >
      <AppText variant="title">{t('account.deleteTitle')}</AppText>
      <AppText color="textSecondary">{t('account.deleteBody')}</AppText>
      {provider === 'email' ? (
        <TextField
          label={t('account.deletePassword')}
          value={secret}
          onChangeText={setSecret}
          password
          autoComplete="current-password"
          textContentType="password"
          editable={!busy}
        />
      ) : (
        <>
          <AppText variant="callout" color="textSecondary">
            {t('account.deleteSocialHint', { provider: PROVIDER_NAME[provider] })}
          </AppText>
          <TextField
            label={t('account.deleteUsername', { username })}
            value={secret}
            onChangeText={setSecret}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </>
      )}
      <FormMessage message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
});
