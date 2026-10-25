import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { deleteMyAccount } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const email = useAuth().session?.user.email ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    if (!password) {
      setError(t('errors.required'));
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
          deleteMyAccount(email, password)
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
      <TextField
        label={t('account.deletePassword')}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
      />
      <FormMessage message={error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
});
