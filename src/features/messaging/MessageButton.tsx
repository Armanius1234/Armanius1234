import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useI18n } from '@/i18n';
import { errorKey } from '@/lib/errors';
import { Button } from '@/ui';

import { useStartConversation } from './api';

/** Opens (or creates) the conversation with someone. Their messaging setting applies. */
export function MessageButton({ userId, variant = 'secondary' }: { userId: string; variant?: 'primary' | 'secondary' }) {
  const { t } = useI18n();
  const start = useStartConversation();
  return (
    <Button
      label={t('chat.message')}
      variant={variant}
      compact
      style={{ flex: 1 }}
      loading={start.isPending}
      onPress={() =>
        start.mutate(userId, {
          onSuccess: (id) => router.push({ pathname: '/chat/[id]', params: { id } }),
          onError: (e) => Alert.alert(t('chat.message'), t(errorKey(e))),
        })
      }
    />
  );
}
