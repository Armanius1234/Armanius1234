import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { useI18n } from '@/i18n';

export default function PlateSearchScreen() {
  const { t } = useI18n();
  return (
    <ComingSoon
      title={t('tabs.search')}
      icon="search-outline"
      heading={t('placeholders.searchTitle')}
      body={t('placeholders.searchBody')}
      milestone={2}
    />
  );
}
