import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { Button, EmptyView } from '@/ui';

export default function NotFoundScreen() {
  const { t } = useI18n();
  return (
    <View style={styles.root}>
      <EmptyView icon="help-circle-outline" title={t('profile.notFound')} />
      <Link href="/" replace asChild>
        <Button label={t('common.back')} variant="secondary" />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary, padding: spacing.md, paddingBottom: spacing.xxl },
});
