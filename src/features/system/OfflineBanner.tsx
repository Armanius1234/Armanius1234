import Ionicons from '@expo/vector-icons/Ionicons';
import { useNetInfo } from '@react-native-community/netinfo';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { AppText } from '@/ui';

/** Thin bar at the top while the phone has no connection. */
export function OfflineBanner() {
  const { t } = useI18n();
  const { isConnected } = useNetInfo();
  const insets = useSafeAreaInsets();
  // null = not known yet; only warn when the phone reports no connection.
  if (isConnected !== false) return null;
  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + spacing.xxs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.textPrimary} />
      <AppText variant="caption">{t('system.offline')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warning,
  },
});
