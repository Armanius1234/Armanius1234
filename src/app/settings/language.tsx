import { StyleSheet } from 'react-native';

import { useUpdateSettings } from '@/features/profile/api';
import { useI18n, type Locale } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { ChoiceGroup, FormMessage, Screen, Section } from '@/ui';

export default function LanguageScreen() {
  const { t, locale, setLocale } = useI18n();
  const update = useUpdateSettings();

  function choose(next: Locale) {
    const previous = locale;
    setLocale(next); // instant feedback
    update.mutate({ locale: next }, { onError: () => setLocale(previous) });
  }

  return (
    <Screen edges={['bottom']} contentStyle={styles.content}>
      <Section>
        <ChoiceGroup<Locale>
          value={locale}
          onChange={choose}
          disabled={update.isPending}
          options={[
            { value: 'de', label: t('settings.languageGerman') },
            { value: 'en', label: t('settings.languageEnglish') },
          ]}
        />
      </Section>
      <FormMessage message={update.error ? t(errorKey(update.error)) : null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.lg },
});
