import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SuggestedPeople } from '@/features/discovery/components';
import { GridFeedScreen } from '@/features/social/GridFeedScreen';
import { useI18n } from '@/i18n';
import { colors, spacing } from '@/theme/tokens';
import { AppText, Logo } from '@/ui';

export default function DiscoverScreen() {
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <GridFeedScreen
        mode="discover"
        emptyTitle={t('feed.discoverEmpty')}
        emptyBody={t('feed.discoverEmptyBody')}
        header={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppText variant="title">{t('tabs.discover')}</AppText>
              <Logo width={64} framed={false} />
            </View>
            <AppText variant="callout" color="textSecondary">
              {t('feed.discoverHint')}
            </AppText>
            <SuggestedPeople />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
