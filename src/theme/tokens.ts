/**
 * PL8 design tokens. The brand colours are fixed by the founder;
 * change them only with approval.
 */
export const colors = {
  bgPrimary: '#080B12',
  bgSecondary: '#121722',
  bgElevated: '#1A2030',
  accent: '#087CFF',
  accentPressed: '#0066D6',
  accentSubtle: 'rgba(8, 124, 255, 0.12)',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textDisabled: '#5B6270',
  border: '#252B36',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerSubtle: 'rgba(239, 68, 68, 0.12)',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  logo: 'Orbitron_900Black',
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 3 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Minimum touch target (iOS HIG / Material). */
export const hitSize = 44;
