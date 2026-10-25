import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { otpSchema } from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

export default function VerifyEmailScreen() {
  const { t } = useI18n();
  const { verifyEmail, resendConfirmation } = useAuth();
  const params = useLocalSearchParams<{ email?: string; resend?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  async function resend() {
    setMessage(null);
    setResending(true);
    try {
      await resendConfirmation(email);
      setMessage({ text: t('auth.resent'), tone: 'success' });
    } catch (e) {
      setMessage({ text: t(errorKey(e)), tone: 'error' });
    } finally {
      setResending(false);
    }
  }

  // Coming from login with an unconfirmed email: send a fresh code once.
  const autoResent = useRef(false);
  useEffect(() => {
    if (params.resend === '1' && email && !autoResent.current) {
      autoResent.current = true;
      void resend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.resend, email]);

  async function submit() {
    setMessage(null);
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) {
      setCodeError(t('errors.code_invalid'));
      return;
    }
    setCodeError(undefined);
    setBusy(true);
    try {
      await verifyEmail(email, parsed.data);
      // Session now exists; navigation continues to onboarding.
    } catch (e) {
      setMessage({ text: t(errorKey(e)), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title">{t('auth.verifyTitle')}</AppText>
        <AppText color="textSecondary">{t('auth.verifySubtitle', { email })}</AppText>
      </View>
      <TextField
        label={t('auth.code')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        error={codeError}
        onSubmitEditing={submit}
      />
      <FormMessage message={message?.text} tone={message?.tone} />
      <Button label={t('auth.verifyButton')} onPress={submit} loading={busy} disabled={!email} />
      <Button label={t('auth.resend')} variant="ghost" onPress={resend} loading={resending} disabled={!email} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 96, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
});
