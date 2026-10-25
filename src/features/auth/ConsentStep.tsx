import { useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalContent } from '@/features/legal/LegalContent';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/theme/tokens';
import { AppText, Button, Checkbox, FormMessage, Screen } from '@/ui';

import { useRecordConsent } from './consent';

/**
 * 18+ and terms for accounts created with Apple / Google (email sign-ups give
 * them on the sign-up form). Until this is done the database keeps the account
 * locked out of everything.
 */
export function ConsentStep() {
  const { t, locale } = useI18n();
  const record = useRecordConsent();
  const [age, setAge] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<{ age?: string; terms?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const submit = () => {
    setFormError(null);
    const next = {
      age: age ? undefined : t('errors.age_required'),
      terms: terms ? undefined : t('errors.terms_required'),
    };
    setErrors(next);
    if (next.age || next.terms) return;
    record.mutate(locale, { onError: (e) => setFormError(t(errorKey(e))) });
  };

  // The login exists but nothing else does yet: delete it and sign out.
  const deleteLogin = async () => {
    setCancelling(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setFormError(t(errorKey(e)));
    } finally {
      setCancelling(false);
    }
  };

  const cancel = () =>
    Alert.alert(t('auth.consentCancelTitle'), t('auth.consentCancelBody'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('auth.consentCancel'),
        style: 'destructive',
        onPress: () => void deleteLogin(),
      },
    ]);

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <>
          <Button label={t('auth.consentContinue')} onPress={submit} loading={record.isPending} disabled={cancelling} />
          <Button label={t('auth.consentCancel')} variant="ghost" onPress={cancel} loading={cancelling} />
        </>
      }
    >
      <AppText variant="title">{t('auth.consentTitle')}</AppText>
      <AppText color="textSecondary">{t('auth.consentBody')}</AppText>
      <Checkbox label={t('auth.ageConfirm')} checked={age} onChange={setAge} error={errors.age} />
      <Checkbox label={t('auth.termsConfirm')} checked={terms} onChange={setTerms} error={errors.terms} />
      <Button label={t('auth.viewLegal')} variant="ghost" compact onPress={() => setLegalOpen(true)} />
      <FormMessage message={formError} />

      <Modal visible={legalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLegalOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalBar}>
            <Button label={t('common.done')} variant="ghost" compact onPress={() => setLegalOpen(false)} />
          </View>
          <LegalContent />
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl, gap: spacing.md },
  modal: { flex: 1, backgroundColor: colors.bgPrimary },
  modalBar: { alignItems: 'flex-end', paddingHorizontal: spacing.md },
});
