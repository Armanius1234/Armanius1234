import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme/tokens';

type Frame = 'pill' | 'corners' | 'none';

type Props = {
  /** Width in points. Height follows the wordmark. */
  width?: number;
  /** "pill": rounded plate frame (app). "corners": glowing corner brackets (hero). */
  frame?: Frame;
};

const RATIO = 0.3;

/**
 * PL8TE wordmark: heavy slanted letters, "8" in electric blue, in a
 * plate-like frame whose border fades from white to blue.
 */
export function Logo({ width = 220, frame = 'pill' }: Props) {
  const kind = frame;
  const height = width * RATIO;
  const stroke = Math.max(1.5, width * 0.012);
  // Room for the glow so it is never clipped by the canvas edge.
  const inset = stroke * 2.5;
  const fontSize = height * 0.6;
  const w = width - inset * 2;
  const h = height - inset * 2;
  const arm = h * 0.42;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="PL8TE" style={[styles.wrap, { width, height }]}>
      {kind !== 'none' ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="pl8teFrame" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.textPrimary} />
              <Stop offset="0.5" stopColor={colors.textPrimary} />
              <Stop offset="1" stopColor={colors.accent} />
            </LinearGradient>
          </Defs>
          {kind === 'pill' ? (
            <>
              <Rect x={inset} y={inset} width={w} height={h} rx={h * 0.32} stroke={colors.accent} strokeOpacity={0.25} strokeWidth={stroke * 3} fill="none" />
              <Rect x={inset} y={inset} width={w} height={h} rx={h * 0.32} stroke="url(#pl8teFrame)" strokeWidth={stroke} fill="none" />
            </>
          ) : (
            [stroke * 3, stroke].map((sw, i) => (
              <Path
                key={sw}
                d={[
                  // top-left, top-right, bottom-right, bottom-left brackets
                  `M ${inset} ${inset + arm} V ${inset + 6} Q ${inset} ${inset} ${inset + 6} ${inset} H ${inset + arm * 1.4}`,
                  `M ${inset + w - arm * 1.4} ${inset} H ${inset + w - 6} Q ${inset + w} ${inset} ${inset + w} ${inset + 6} V ${inset + arm}`,
                  `M ${inset + w} ${inset + h - arm} V ${inset + h - 6} Q ${inset + w} ${inset + h} ${inset + w - 6} ${inset + h} H ${inset + w - arm * 1.4}`,
                  `M ${inset + arm * 1.4} ${inset + h} H ${inset + 6} Q ${inset} ${inset + h} ${inset} ${inset + h - 6} V ${inset + h - arm}`,
                ].join(' ')}
                stroke={i === 0 ? colors.accent : 'url(#pl8teFrame)'}
                strokeOpacity={i === 0 ? 0.3 : 1}
                strokeWidth={sw}
                strokeLinecap="round"
                fill="none"
              />
            ))
          )}
        </Svg>
      ) : null}
      <Text style={[styles.word, { fontSize, lineHeight: fontSize * 1.2 }]} allowFontScaling={false}>
        PL<Text style={styles.eight}>8</Text>TE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  word: {
    fontFamily: fonts.logo,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  eight: {
    color: colors.accent,
    textShadowColor: 'rgba(8, 124, 255, 0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
});
