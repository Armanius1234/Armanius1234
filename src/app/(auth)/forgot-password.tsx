import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { emailSchema, fieldErrors, resetPasswordSchema, type FieldErrors } from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

type Field = 'code' | 'password' | 'confirmPassword';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const { requestPasswordReset, completePasswordReset } = useAuth();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setFormError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(t(`errors.${parsed.error.issues[0]?.message === 'required' ? 'required' : 'email_invalid'}`));
      return;
    }
    setEmailError(undefined);
    setBusy(true);
    try {
      await requestPasswordReset(parsed.data);
      setEmail(parsed.data);
      setStep('reset');
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ code, password, confirmPassword });
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await completePasswordReset(email, parsed.data.code, parsed.data.password);
      // Signed in with the new password; navigation continues automatically.
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const err = (f: Field) => (errors[f] ? t(`errors.${errors[f]}`) : undefined);

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title">{t('auth.forgotTitle')}</AppText>
        <AppText color="textSecondary">
          {step === 'email' ? t('auth.forgotSubtitle') : t('auth.resetSubtitle', { email })}
        </AppText>
      </View>

      {step === 'email' ? (
        <>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={emailError}
            onSubmitEditing={sendCode}
          />
          <FormMessage message={formError} />
          <Button label={t('auth.sendCode')} onPress={sendCode} loading={busy} />
        </>
      ) : (
        <>
          <TextField
            label={t('auth.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={10}
            error={err('code')}
          />
          <TextField
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('auth.passwordHint')}
            error={err('password')}
          />
          <TextField
            label={t('auth.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            error={err('confirmPassword')}
          />
          <FormMessage message={formError} />
          <Button label={t('auth.resetButton')} onPress={reset} loading={busy} />
          <Button label={t('auth.resend')} variant="ghost" onPress={sendCode} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 96, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
});
