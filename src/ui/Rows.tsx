import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { colors, hitSize, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View style={styles.section}>
      {title ? (
        <AppText variant="overline" color="textSecondary" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={styles.card}>{children}</View>
      {footer ? (
        <AppText variant="caption" color="textSecondary" style={styles.sectionFooter}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

type RowProps = {
  label: string;
  icon?: IconName;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  accessory?: ReactNode;
};

export function ListRow({ label, icon, value, onPress, destructive, accessory }: RowProps) {
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.textSecondary} /> : null}
      <AppText style={styles.label} color={destructive ? 'danger' : 'textPrimary'}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="callout" color="textSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {accessory}
      {onPress && !accessory ? <Ionicons name="chevron-forward" size={18} color={colors.textDisabled} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

type SwitchRowProps = {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, hint, value, onChange, disabled }: SwitchRowProps) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#fff"
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

type Option<T extends string> = { value: T; label: string };

export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={o.label}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            <AppText style={styles.label}>{o.label}</AppText>
            <Ionicons
              name={selected ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={selected ? colors.accent : colors.textDisabled}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  return <View style={styles.hr} />;
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  sectionTitle: { paddingHorizontal: spacing.xxs },
  sectionFooter: { paddingHorizontal: spacing.xxs },
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: hitSize + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.bgElevated },
  label: { flex: 1 },
  value: { maxWidth: '50%' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  switchText: { flex: 1, gap: spacing.xxs },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.md },
});
