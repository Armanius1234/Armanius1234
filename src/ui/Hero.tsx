/**
 * The PL8TE look from the brand images: the car in the dark with blue light,
 * fading into the background colour towards the bottom.
 */
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme/tokens';

const HERO = require('../../assets/images/hero-car.webp');

export function HeroBackground({ dim = 0.15 }: { dim?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bgPrimary} stopOpacity={0.55 + dim} />
            <Stop offset="0.35" stopColor={colors.bgPrimary} stopOpacity={dim} />
            <Stop offset="0.62" stopColor={colors.bgPrimary} stopOpacity={0.25 + dim} />
            <Stop offset="1" stopColor={colors.bgPrimary} stopOpacity={0.97} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill="url(#heroFade)" />
      </Svg>
    </View>
  );
}
