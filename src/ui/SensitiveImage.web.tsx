/**
 * Browser version of SensitiveImage: the photo is downloaded with
 * cache: 'no-store', so the browser does not keep it in its cache, and shown
 * from memory. The memory copy is freed when the photo leaves the screen.
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme/tokens';

import type { SensitiveImageProps } from './SensitiveImage';

export function SensitiveImage(props: SensitiveImageProps) {
  // A new address starts a fresh download.
  return <MemoryImage key={props.uri} {...props} />;
}

function MemoryImage({ uri, style, contentFit = 'cover' }: SensitiveImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    fetch(uri, { cache: 'no-store', credentials: 'omit' })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [uri]);

  if (!objectUrl) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  return <Image source={{ uri: objectUrl }} style={style} contentFit={contentFit} cachePolicy="none" />;
}
