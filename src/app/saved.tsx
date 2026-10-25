import { GridFeedScreen } from '@/features/social/GridFeedScreen';
import { useI18n } from '@/i18n';

export default function SavedPostsScreen() {
  const { t } = useI18n();
  return <GridFeedScreen mode="saved" emptyTitle={t('post.savedEmpty')} emptyBody={t('post.savedEmptyBody')} />;
}
