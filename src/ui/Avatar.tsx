import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { AppText } from './AppText';

type Props = { uri: string | null | undefined; name: string; size?: number };

export function Avatar({ uri, name, size = 72 }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <AppText variant="heading" color="textSecondary" style={{ fontSize: size * 0.4, lineHeight: size * 0.5 }}>
          {initial}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
