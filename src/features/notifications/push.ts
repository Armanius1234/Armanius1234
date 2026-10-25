/**
 * Push notifications via the free Expo Push Service.
 *
 * Works in installed builds (EAS development / preview / production) once the
 * project has an EAS project id. In Expo Go, or before `eas init`, it does
 * nothing and the in-app notification list still works.
 */
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PushStatus = 'registered' | 'denied' | 'unavailable';

let currentToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

function pushPossible(): boolean {
  if (!Device.isDevice || !projectId() || Platform.OS === 'web') return false;
  // Expo Go on Android has no remote push support (since SDK 53).
  return !(Platform.OS === 'android' && isRunningInExpoGo());
}

/** Current permission state, without asking. */
export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
  if (!pushPossible()) return 'unavailable';
  try {
    return (await Notifications.getPermissionsAsync()).status;
  } catch {
    return 'unavailable';
  }
}

/**
 * Get this phone's push token and store it for the signed-in user.
 * `ask` shows the system permission prompt if it was never answered.
 */
export async function registerForPush({ ask }: { ask: boolean }): Promise<PushStatus> {
  const id = projectId();
  if (!id || !pushPossible()) return 'unavailable';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'PL8',
      importance: AndroidImportance.HIGH,
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) throw error;
    currentToken = token;
    return 'registered';
  } catch {
    // e.g. Expo Go on Android, which no longer supports remote pushes
    return 'unavailable';
  }
}

/** Remove this phone's token (sign out / account deletion). */
export async function unregisterPush(): Promise<void> {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

type PushData = { type?: unknown; conversation_id?: unknown; post_id?: unknown; vehicle_id?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);

/** Where a tapped push should lead. Unknown or malformed data opens the notification list. */
export function pushHref(data: PushData) {
  const type = typeof data.type === 'string' ? data.type : '';
  const conversation = asUuid(data.conversation_id);
  const post = asUuid(data.post_id);
  const vehicle = asUuid(data.vehicle_id);
  if (type === 'message' && conversation) return { pathname: '/chat/[id]', params: { id: conversation } } as const;
  if ((type === 'like' || type === 'comment') && post) return { pathname: '/post/[id]', params: { id: post } } as const;
  if ((type.startsWith('verification') || type.startsWith('plate')) && vehicle) {
    return { pathname: '/vehicle/[id]/plate', params: { id: vehicle } } as const;
  }
  return '/notifications' as const;
}

/** Registers silently if allowed and opens the right screen when a push is tapped. */
export function usePushSetup(enabled: boolean) {
  useEffect(() => {
    if (enabled) void registerForPush({ ask: false });
  }, [enabled]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      router.push(pushHref((response.notification.request.content.data ?? {}) as PushData));
    });
    return () => sub.remove();
  }, []);
}
