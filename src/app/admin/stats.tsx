import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useIsAdmin } from '@/features/garage/api';
import { shareStatsCsv, useModerationStats } from '@/features/moderation/appeals';
import { useI18n } from '@/i18n';
import type { ModerationStats } from '@/lib/database.types';
import { errorKey } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme/tokens';
import { AppText, Button, EmptyView, ErrorView, LoadingView, Screen } from '@/ui';
import { Segmented } from '@/ui/Segmented';

type Period = '30' | '365';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText color="textSecondary" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <AppText variant="overline" color="textSecondary">
        {title.toUpperCase()}
      </AppText>
      {children}
    </View>
  );
}

/** Numbers for the DSA transparency report. */
export default function ModerationStatsScreen() {
  const { t } = useI18n();
  const admin = useIsAdmin();
  const isAdmin = admin.data === true;
  const [period, setPeriod] = useState<Period>('30');
  const stats = useModerationStats(isAdmin, Number(period));
  const [sharing, setSharing] = useState(false);

  if (admin.isPending) return <LoadingView />;
  if (!isAdmin) return <EmptyView icon="lock-closed-outline" title={t('errors.permission_denied')} />;

  const s: ModerationStats | undefined = stats.data;

  return (
    <Screen
      scroll
      edges={['bottom']}
      contentStyle={styles.content}
      footer={
        s ? (
          <Button
            label={t('stats.share')}
            variant="secondary"
            loading={sharing}
            onPress={() => {
              setSharing(true);
              shareStatsCsv(s, t('stats.shareTitle'))
                .catch((e: unknown) => Alert.alert(t('states.errorTitle'), t(errorKey(e))))
                .finally(() => setSharing(false));
            }}
          />
        ) : undefined
      }
    >
      <AppText color="textSecondary">{t('stats.hint')}</AppText>
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: '30', label: t('stats.period_30') },
          { value: '365', label: t('stats.period_365') },
        ]}
      />
      {stats.isPending ? (
        <LoadingView />
      ) : stats.isError || !s ? (
        <ErrorView onRetry={() => void stats.refetch()} retrying={stats.isFetching} />
      ) : (
        <>
          <Card title={t('stats.byReason')}>
            <Row label={t('stats.reportsReceived')} value={s.reports_received} />
            {Object.entries(s.reports_by_reason).map(([reason, n]) => (
              <Row key={reason} label={t(`report.reason_${reason as 'other'}`)} value={n ?? 0} />
            ))}
          </Card>
          <Card title={t('stats.byTarget')}>
            {Object.entries(s.reports_by_target).map(([target, n]) => (
              <Row key={target} label={capitalize(t(`report.target_${target as 'post'}`))} value={n ?? 0} />
            ))}
          </Card>
          <Card title={t('stats.decisions')}>
            {(['dismiss', 'remove', 'suspend'] as const).map((a) => (
              <Row key={a} label={t(`moderation.action_${a}`)} value={s.decisions[a] ?? 0} />
            ))}
            <Row
              label={t('stats.medianHours')}
              value={s.median_hours_to_decision === null ? '–' : t('stats.hours', { n: s.median_hours_to_decision })}
            />
          </Card>
          <Card title={t('stats.appeals')}>
            <Row label={t('stats.appealsReceived')} value={s.appeals_received} />
            <Row label={t('stats.appealsUpheld')} value={s.appeals_upheld} />
            <Row label={t('stats.appealsReversed')} value={s.appeals_reversed} />
            <Row label={t('stats.appealsOpen')} value={s.appeals_open} />
          </Card>
          <Card title={t('stats.suspendedNow')}>
            <Row label={t('stats.suspendedNow')} value={s.accounts_suspended_now} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, gap: spacing.md },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  flex: { flex: 1 },
});
