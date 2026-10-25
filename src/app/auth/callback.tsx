import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { completeOAuthFromUrl, oauthRedirect } from '@/features/auth/social';
import { LoadingView } from '@/ui';

/**
 * Where Apple / Google send the user back (pl8://auth/callback). Usually the
 * sign-in sheet handles the code itself; on Android the link can also open
 * this screen, so it finishes the sign-in if needed and moves on.
 */
export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    let active = true;
    const finish = typeof code === 'string' && code
      ? completeOAuthFromUrl(`${oauthRedirect()}?code=${encodeURIComponent(code)}`).catch(() => undefined)
      : Promise.resolve();
    void finish.then(() => {
      if (active) router.replace('/');
    });
    return () => {
      active = false;
    };
  }, [code]);

  return <LoadingView />;
}
