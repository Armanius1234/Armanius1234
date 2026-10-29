import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { exportMyData } from '@/features/account/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppealForm, DecisionCard } from '@/features/moderation/AppealComponents';
import { canAppeal, useMyDecisions } from '@/features/moderation/appeals';
import { unregisterPush } from '@/features/notifications/push';
import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme/tokens';
import { AppText, Button, ErrorView, LoadingView, Screen } from '@/ui';

/**
 * What a suspended account sees: the reason, the appeal, and its data rights.
 * The database keeps the account locked out of everything else.
 */
export default function SuspendedScreen() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const decisions = useMyDecisions();
  const [exporting, setExporting] = useState(false);
  const suspension = decisions.data?.find((d) => d.role === 'owner' && d.action === 'suspend');

  if (decisions.isPending) return <LoadingView />;
  if (decisions.isError) return <ErrorView onRetry={() => void decisions.refetch()} retrying={decisions.isFetching} />;

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <Button
          label={t('auth.signOut')}
          variant="ghost"
          onPress={() => void unregisterPush().catch(() => undefined).then(() => signOut())}
        />
      }
    >
      <AppText variant="title">{t('appeal.suspendedTitle')}</AppText>
      <AppText color="textSecondary">{t('appeal.suspendedBody')}</AppText>
      {suspension ? (
        <>
          <DecisionCard decision={suspension} />
          {canAppeal(suspension) ? (
            <>
              <AppText color="textSecondary">{t('appeal.suspendedAppealHint')}</AppText>
              <AppealForm reportId={suspension.report_id} onSent={() => void decisions.refetch()} />
            </>
          ) : null}
        </>
      ) : null}
      <View style={styles.data}>
        <Button
          label={t('account.exportRow')}
          variant="secondary"
          loading={exporting}
          onPress={() => {
            setExporting(true);
            exportMyData(t('account.exportShareTitle'))
              .catch((e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e))))
              .finally(() => setExporting(false));
          }}
        />
        <Button label={t('account.deleteRow')} variant="secondary" onPress={() => router.push('/settings/delete-account')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl, gap: spacing.md },
  data: { gap: spacing.sm, marginTop: spacing.md },
});
