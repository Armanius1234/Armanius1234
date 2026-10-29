import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import type { Decision } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, FormMessage, TextField } from '@/ui';

import { canAppeal, decisionTitle, useSubmitAppeal } from './appeals';

const STATUS_COLOR = { open: 'warning', upheld: 'textSecondary', reversed: 'success' } as const;

/** One moderation decision: what happened, why, and where the appeal stands. */
export function DecisionCard({ decision, onAppeal }: { decision: Decision; onAppeal?: () => void }) {
  const { t, locale } = useI18n();
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB');
  return (
    <View style={styles.card}>
      <AppText variant="bodyStrong">{decisionTitle(t, decision)}</AppText>
      <AppText variant="caption" color="textSecondary">
        {date(decision.decided_at)} · {t('appeal.reasonLine', { reason: t(`report.reason_${decision.reason}`) })}
      </AppText>
      {decision.note ? <AppText variant="callout">{t('appeal.noteLine', { note: decision.note })}</AppText> : null}
      {decision.appeal_status ? (
        <>
          <AppText variant="callout" color={STATUS_COLOR[decision.appeal_status]}>
            {t(`appeal.status_${decision.appeal_status}`)}
          </AppText>
          {decision.appeal_note ? (
            <AppText variant="callout" color="textSecondary">
              {t('appeal.replyLine', { note: decision.appeal_note })}
            </AppText>
          ) : null}
          {decision.appeal_status !== 'open' ? (
            <AppText variant="caption" color="textSecondary">
              {t('appeal.redress')}
            </AppText>
          ) : null}
        </>
      ) : canAppeal(decision) ? (
        <>
          <AppText variant="caption" color="textSecondary">
            {t('appeal.until', { date: date(decision.appeal_until) })}
          </AppText>
          {onAppeal ? <Button label={t('appeal.appeal')} variant="secondary" compact onPress={onAppeal} /> : null}
        </>
      ) : (
        <AppText variant="caption" color="textSecondary">
          {t('appeal.expired')}
        </AppText>
      )}
    </View>
  );
}

/** The appeal text box. Calls onSent after a successful appeal. */
export function AppealForm({ reportId, onSent }: { reportId: string; onSent?: () => void }) {
  const { t } = useI18n();
  const submit = useSubmitAppeal();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (submit.isSuccess) {
    return <FormMessage tone="success" message={t('appeal.sent')} />;
  }

  return (
    <View style={styles.form}>
      <AppText variant="heading">{t('appeal.formTitle')}</AppText>
      <AppText color="textSecondary">{t('appeal.formBody')}</AppText>
      <TextField label={t('appeal.field')} value={reason} onChangeText={setReason} multiline maxLength={2000} />
      <FormMessage message={error} />
      <Button
        label={t('appeal.submit')}
        loading={submit.isPending}
        onPress={() => {
          setError(null);
          if (reason.trim().length < 10) {
            setError(t('errors.appeal_reason'));
            return;
          }
          submit.mutate({ reportId, reason }, { onSuccess: () => onSent?.(), onError: (e) => setError(t(errorKey(e))) });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  form: { gap: spacing.sm },
});
