import { useLocalSearchParams } from 'expo-router';

import { FollowListScreen } from '@/features/social/FollowListScreen';
import { normalizeUsername } from '@/shared/validation';

export default function FollowersScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  return <FollowListScreen username={normalizeUsername(String(username ?? ''))} kind="followers" />;
}
