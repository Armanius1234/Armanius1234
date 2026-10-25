import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { useI18n } from '@/i18n';

export default function DiscoverScreen() {
  const { t } = useI18n();
  return (
    <ComingSoon
      title={t('tabs.discover')}
      icon="compass-outline"
      heading={t('placeholders.discoverTitle')}
      body={t('placeholders.discoverBody')}
      milestone={3}
    />
  );
}
