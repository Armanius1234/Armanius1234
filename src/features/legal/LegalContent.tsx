import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText, FormMessage, Screen } from '@/ui';

const SECTIONS: [TKey, TKey][] = [
  ['legal.impressumTitle', 'legal.impressumBody'],
  ['legal.privacyTitle', 'legal.privacyBody'],
  ['legal.termsTitle', 'legal.termsBody'],
  ['legal.sourcesTitle', 'legal.sourcesBody'],
];

/** Placeholder legal texts until the lawyer-reviewed versions exist. */
export function LegalContent() {
  const { t } = useI18n();
  return (
    <Screen scroll contentStyle={styles.content} edges={['bottom']}>
      <AppText variant="title">{t('legal.title')}</AppText>
      <FormMessage message={t('settings.legalDraft')} />
      {SECTIONS.map(([title, body]) => (
        <View key={title} style={styles.section}>
          <AppText variant="heading">{t(title)}</AppText>
          <AppText color="textSecondary">{t(body)}</AppText>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.xs },
});
