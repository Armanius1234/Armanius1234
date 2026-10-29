import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, hitSize, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  compact?: boolean;
};

export function Button({ label, variant = 'primary', loading, disabled, icon, compact, style, ...rest }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      {...rest}
      style={(state) => [
        styles.base,
        compact && styles.compact,
        variantStyles[variant],
        state.pressed && pressedStyles[variant],
        inactive && styles.inactive,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.textPrimary : '#fff'} />
      ) : (
        <View style={styles.row}>
          {icon}
          <AppText variant="bodyStrong" color={variant === 'ghost' ? 'accent' : 'textPrimary'}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  compact: { minHeight: hitSize, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inactive: { opacity: 0.5 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accentSolid },
  secondary: { backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: colors.dangerSolid },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.bgElevated },
  ghost: { opacity: 0.6 },
  destructive: { opacity: 0.8 },
});
