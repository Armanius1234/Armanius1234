/**
 * Web version on http://localhost without a Supabase connection: a form to
 * enter the two public values, saved in this browser only. On a real website
 * the "Backend not configured" message is shown instead (see _layout.tsx).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, type TKey } from '@/i18n';
import { checkLocalConfig, restartApp, saveLocalConfig } from '@/lib/localConfig';
import { spacing } from '@/theme/tokens';
import { AppText, Button, Logo, Screen, TextField } from '@/ui';

const PROBLEM_TEXT: Record<'url' | 'key' | 'secret', TKey> = {
  url: 'local.errorUrl',
  key: 'local.errorKey',
  secret: 'local.errorSecret',
};

export function LocalSetup({ onSaved = restartApp }: { onSaved?: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [problem, setProblem] = useState<'url' | 'key' | 'secret' | null>(null);

  function connect() {
    const found = checkLocalConfig(url, key);
    setProblem(found);
    if (found) return;
    saveLocalConfig(url, key);
    onSaved();
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.logo}>
        <Logo width={140} />
      </View>
      <AppText variant="title">{t('local.title')}</AppText>
      <AppText color="textSecondary">{t('local.body')}</AppText>
      <AppText variant="caption" color="accent">
        {t('local.noProject')}
      </AppText>
      <TextField
        label={t('local.url')}
        placeholder="https://abcdefghijkl.supabase.co"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
        error={problem === 'url' ? t(PROBLEM_TEXT.url) : undefined}
      />
      <TextField
        label={t('local.key')}
        placeholder="sb_publishable_…"
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        error={problem === 'key' || problem === 'secret' ? t(PROBLEM_TEXT[problem]) : undefined}
      />
      <Button label={t('local.connect')} onPress={connect} />
      <AppText variant="caption" color="warning">
        {t('local.secretWarning')}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {t('local.alsoFile')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl, gap: spacing.md },
  logo: { alignItems: 'center', marginBottom: spacing.md },
});
