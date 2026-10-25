import { Text, type TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme/tokens';

type Props = TextProps & {
  variant?: TypographyVariant;
  color?: keyof typeof colors;
  center?: boolean;
};

export function AppText({ variant = 'body', color = 'textPrimary', center, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      style={[typography[variant], { color: colors[color] }, center && { textAlign: 'center' }, style]}
    />
  );
}
