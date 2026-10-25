import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function LoadingView({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.center} accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

type ErrorProps = { title?: string; message?: string; onRetry?: () => void; retrying?: boolean };

export function ErrorView({ title, message, onRetry, retrying }: ErrorProps) {
  const { t } = useI18n();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
      <AppText variant="heading" center>
        {title ?? t('states.errorTitle')}
      </AppText>
      <AppText color="textSecondary" center>
        {message ?? t('states.errorBody')}
      </AppText>
      {onRetry ? <Button label={t('common.retry')} variant="secondary" onPress={onRetry} loading={retrying} /> : null}
    </View>
  );
}

type EmptyProps = { icon: IconName; title: string; body?: string; badge?: string };

export function EmptyView({ icon, title, body, badge }: EmptyProps) {
  return (
    <View style={styles.center}>
      <View style={styles.iconRing}>
        <Ionicons name={icon} size={32} color={colors.accent} />
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="overline" color="accent">
            {badge}
          </AppText>
        </View>
      ) : null}
      <AppText variant="heading" center>
        {title}
      </AppText>
      {body ? (
        <AppText color="textSecondary" center>
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

/** Inline error/success message for forms. */
export function FormMessage({ message, tone = 'error' }: { message?: string | null; tone?: 'error' | 'success' }) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.message, tone === 'error' ? styles.messageError : styles.messageSuccess]}
    >
      <Ionicons
        name={tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={18}
        color={tone === 'error' ? colors.danger : colors.success}
      />
      <AppText variant="callout" style={styles.messageText}>
        {message}
      </AppText>
    </View>
  );
}

export function Skeleton({ style }: { style?: ViewStyle }) {
  const [opacity] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.skeleton, style, { opacity }]} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.bgPrimary,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  messageError: { backgroundColor: colors.dangerSubtle },
  messageSuccess: { backgroundColor: 'rgba(34, 197, 94, 0.12)' },
  messageText: { flex: 1 },
  skeleton: { backgroundColor: colors.bgElevated, borderRadius: radius.md },
});
