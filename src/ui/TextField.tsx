import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, hitSize, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  /** Shown at the right edge inside the field (e.g. availability status). */
  accessory?: ReactNode;
  /** Adds a show/hide toggle. */
  password?: boolean;
};

export function TextField({ label, error, hint, accessory, password, style, multiline, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.wrap}>
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textDisabled}
          selectionColor={colors.accent}
          secureTextEntry={password && hidden}
          autoCorrect={false}
          multiline={multiline}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMultiline, style]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            style={styles.accessory}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  focused: { borderColor: colors.accent },
  errored: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: hitSize,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  accessory: { marginLeft: spacing.xs, minHeight: hitSize, justifyContent: 'center' },
});
