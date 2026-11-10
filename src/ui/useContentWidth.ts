import { Platform, useWindowDimensions } from 'react-native';

import { WEB_COLUMN_WIDTH } from '@/theme/tokens';

/**
 * The width the app has for its content: the screen width on a phone, and
 * at most the centred column on a wide browser window (see _layout.tsx).
 */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' ? Math.min(width, WEB_COLUMN_WIDTH) : width;
}
