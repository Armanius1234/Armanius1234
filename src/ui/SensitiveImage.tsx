/**
 * Photos that must not stay on the device: verification evidence and reported
 * content. On the phone they are kept in memory only, never in the disk cache.
 * The browser version is SensitiveImage.web.tsx.
 */
import { Image, type ImageContentFit } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

export type SensitiveImageProps = { uri: string; style?: StyleProp<ImageStyle>; contentFit?: ImageContentFit };

export function SensitiveImage({ uri, style, contentFit = 'cover' }: SensitiveImageProps) {
  return <Image source={{ uri }} style={style} contentFit={contentFit} cachePolicy="memory" />;
}
