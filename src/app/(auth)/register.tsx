import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { fieldErrors, registerSchema, type FieldErrors } from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, Checkbox, FormMessage, Screen, TextField } from '@/ui';

type Field = 'email' | 'password' | 'confirmPassword' | 'ageConfirmed' | 'termsAccepted';

export default function RegisterScreen() {
  const { t, locale } = useI18n();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = registerSchema.safeParse({ email, password, confirmPassword, ageConfirmed, termsAccepted });
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await signUp({ email: parsed.data.email, password: parsed.data.password, locale });
      if (result.needsEmailConfirmation) {
        router.replace({ pathname: '/verify-email', params: { email: parsed.data.email } });
      }
      // Otherwise a session exists and navigation moves on automatically.
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
        <AppText variant="title">{t('auth.registerTitle')}</AppText>
        <AppText color="textSecondary">{t('auth.registerSubtitle')}</AppText>
      </View>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={err('email')}
      />
      <TextField
        label={t('auth.password')}
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
      <Checkbox label={t('auth.ageConfirm')} checked={ageConfirmed} onChange={setAgeConfirmed} error={err('ageConfirmed')} />
      <Checkbox
        label={t('auth.termsConfirm')}
        checked={termsAccepted}
        onChange={setTermsAccepted}
        error={err('termsAccepted')}
      />
      <Link href="/legal" asChild>
        <Button label={t('auth.viewLegal')} variant="ghost" compact />
      </Link>
      <FormMessage message={formError} />
      <Button label={t('auth.registerButton')} onPress={submit} loading={busy} />
      <View style={styles.switch}>
        <AppText color="textSecondary">{t('auth.haveAccount')}</AppText>
        <Link href="/login" replace asChild>
          <Button label={t('auth.loginLink')} variant="ghost" compact />
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 96, gap: spacing.md },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  switch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
