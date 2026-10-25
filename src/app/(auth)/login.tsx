import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { SocialButtons } from '@/features/auth/SocialButtons';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { fieldErrors, loginSchema, type FieldErrors } from '@/shared/validation';
import { spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, Screen, TextField } from '@/ui';

type Field = 'email' | 'password';

export default function LoginScreen() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors<Field>(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      // Navigation happens automatically once the session exists.
    } catch (e) {
      const key = errorKey(e);
      if (key === 'errors.email_not_confirmed') {
        router.push({ pathname: '/verify-email', params: { email: parsed.data.email, resend: '1' } });
        return;
      }
      setFormError(t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.header}>
        <AppText variant="title">{t('auth.loginTitle')}</AppText>
        <AppText color="textSecondary">{t('auth.loginSubtitle')}</AppText>
      </View>
      <SocialButtons />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={errors.email && t(`errors.${errors.email}`)}
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        error={errors.password && t(`errors.${errors.password}`)}
      />
      <FormMessage message={formError} />
      <Button label={t('auth.loginButton')} onPress={submit} loading={busy} />
      <Link href="/forgot-password" asChild>
        <Button label={t('auth.forgotPassword')} variant="ghost" />
      </Link>
      <View style={styles.switch}>
        <AppText color="textSecondary">{t('auth.noAccount')}</AppText>
        <Link href="/register" replace asChild>
          <Button label={t('auth.registerLink')} variant="ghost" compact />
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
