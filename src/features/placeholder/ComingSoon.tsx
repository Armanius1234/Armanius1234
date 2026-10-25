import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText, EmptyView, Logo, Screen } from '@/ui';

type Props = {
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  heading: string;
  body: string;
  milestone: number;
};

/**
 * Clearly labelled placeholder for a tab whose feature ships in a later
 * milestone. It never pretends to show real data.
 */
export function ComingSoon({ title, icon, heading, body, milestone }: Props) {
  const { t } = useI18n();
  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title">{title}</AppText>
        <Logo width={64} framed={false} />
      </View>
      <EmptyView icon={icon} title={heading} body={body} badge={t('placeholders.milestone', { n: milestone })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
});
