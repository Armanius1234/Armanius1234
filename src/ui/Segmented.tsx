import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSize, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && styles.selected]}
          >
            <AppText variant="bodyStrong" color={selected ? 'textPrimary' : 'textSecondary'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { flex: 1, minHeight: hitSize - 4, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  selected: { backgroundColor: colors.bgElevated },
});
