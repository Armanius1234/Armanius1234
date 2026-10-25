import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { useI18n } from '@/i18n';

export default function HomeScreen() {
  const { t } = useI18n();
  return (
    <ComingSoon
      title={t('tabs.home')}
      icon="car-sport-outline"
      heading={t('placeholders.homeTitle')}
      body={t('placeholders.homeBody')}
      milestone={3}
    />
  );
}
