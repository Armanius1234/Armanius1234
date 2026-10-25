import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSize, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Props = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string;
};

export function Checkbox({ label, checked, onChange, error }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => onChange(!checked)}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxChecked, !!error && !checked && styles.boxError]}>
          {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </View>
        <AppText variant="callout" style={styles.label}>
          {label}
        </AppText>
      </Pressable>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: hitSize },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  boxError: { borderColor: colors.danger },
  label: { flex: 1 },
});
