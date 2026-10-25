import { ComingSoon } from '@/features/placeholder/ComingSoon';
import { useI18n } from '@/i18n';

export default function MessagesScreen() {
  const { t } = useI18n();
  return (
    <ComingSoon
      title={t('tabs.messages')}
      icon="chatbubbles-outline"
      heading={t('placeholders.messagesTitle')}
      body={t('placeholders.messagesBody')}
      milestone={4}
    />
  );
}
