import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { AppText, Avatar, Button, TextField } from '@/ui';

import type { UsernameStatus } from './useUsernameCheck';

export function UsernameField({
  value,
  onChange,
  status,
}: {
  value: string;
  onChange: (v: string) => void;
  status: UsernameStatus;
}) {
  const { t } = useI18n();

  let accessory: React.ReactNode = null;
  let error: string | undefined;
  let hint = t('onboarding.usernameHint');

  switch (status.state) {
    case 'checking':
      accessory = <ActivityIndicator size="small" color={colors.textSecondary} />;
      hint = t('onboarding.usernameChecking');
      break;
    case 'available':
      accessory = <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
      hint = t('onboarding.usernameAvailable');
      break;
    case 'taken':
      accessory = <Ionicons name="close-circle" size={20} color={colors.danger} />;
      error = t('onboarding.usernameTaken');
      break;
    case 'invalid':
      error = t(`errors.${status.reason}`);
      break;
    case 'error':
      error = t('errors.network');
      break;
    default:
      break;
  }

  return (
    <TextField
      label={t('onboarding.username')}
      value={value}
      onChangeText={(v) => onChange(v.toLowerCase().replace(/\s/g, ''))}
      autoCapitalize="none"
      autoComplete="username-new"
      maxLength={30}
      accessory={accessory}
      error={error}
      hint={hint}
    />
  );
}

export function AvatarPicker({
  uri,
  name,
  busy,
  onPick,
  onRemove,
}: {
  uri: string | null;
  name: string;
  busy?: boolean;
  onPick: () => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.avatarRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.choosePhoto')} onPress={onPick} disabled={busy}>
        <Avatar uri={uri} name={name || '?'} size={96} />
        <View style={styles.cameraBadge}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={16} color="#fff" />}
        </View>
      </Pressable>
      <View style={styles.avatarActions}>
        <Button
          label={uri ? t('onboarding.changePhoto') : t('onboarding.choosePhoto')}
          variant="secondary"
          compact
          onPress={onPick}
          disabled={busy}
        />
        {uri && onRemove ? (
          <Button label={t('onboarding.removePhoto')} variant="ghost" compact onPress={onRemove} disabled={busy} />
        ) : null}
      </View>
    </View>
  );
}

export function StepHeader({ current, total, title, subtitle }: { current: number; total: number; title: string; subtitle: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.stepHeader}>
      <View style={styles.progress}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.progressBar, i < current && styles.progressActive]} />
        ))}
      </View>
      <AppText variant="caption" color="textSecondary">
        {t('onboarding.step', { current, total })}
      </AppText>
      <AppText variant="title">{title}</AppText>
      <AppText color="textSecondary">{subtitle}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarActions: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgPrimary,
  },
  stepHeader: { gap: spacing.xs, marginBottom: spacing.sm },
  progress: { flexDirection: 'row', gap: spacing.xxs, marginBottom: spacing.xs },
  progressBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.accent },
});
