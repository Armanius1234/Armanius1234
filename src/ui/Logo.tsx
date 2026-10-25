import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

type Props = {
  /** Width in points. Height follows the plate ratio. */
  width?: number;
  /** Show the plate-inspired frame (default true). */
  framed?: boolean;
};

const RATIO = 0.38;

/**
 * PL8 wordmark: "PL" in white, "8" in electric blue, inside a rounded
 * license-plate frame whose border fades from white to blue.
 */
export function Logo({ width = 220, framed = true }: Props) {
  const height = width * RATIO;
  const stroke = Math.max(2, width * 0.022);
  // Leave room for the glow so it is never clipped by the canvas edge.
  const inset = stroke * 2;
  const fontSize = height * 0.62;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="PL8"
      style={[styles.wrap, { width, height }]}
    >
      {framed ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="pl8Frame" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.textPrimary} />
              <Stop offset="0.55" stopColor={colors.textPrimary} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          {/* soft glow */}
          <Rect
            x={inset}
            y={inset}
            width={width - inset * 2}
            height={height - inset * 2}
            rx={height * 0.24}
            stroke={colors.accent}
            strokeOpacity={0.25}
            strokeWidth={stroke * 3}
            fill="none"
          />
          <Rect
            x={inset}
            y={inset}
            width={width - inset * 2}
            height={height - inset * 2}
            rx={height * 0.24}
            stroke="url(#pl8Frame)"
            strokeWidth={stroke}
            fill="none"
          />
        </Svg>
      ) : null}
      <Text style={[styles.word, { fontSize, lineHeight: fontSize * 1.15 }]} allowFontScaling={false}>
        PL<Text style={styles.eight}>8</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  word: {
    fontFamily: fonts.logo,
    color: colors.textPrimary,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  eight: { color: colors.accent },
});
