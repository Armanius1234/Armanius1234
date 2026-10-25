import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import type { NotificationItem } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const PAGE = 30;

export const notificationKeys = {
  list: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: notificationKeys.list,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<NotificationItem[]> => {
      const { data, error } = await supabase.rpc('my_notifications', { p_before: pageParam, p_limit: PAGE });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.created_at : undefined),
  });
}

export function useUnreadNotifications() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: notificationKeys.unread,
    enabled: !!uid,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('unread_notification_count');
      if (error) throw error;
      return data ?? 0;
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => qc.setQueryData(notificationKeys.unread, 0),
  });
}

/** Live badge: new notifications arrive through Supabase Realtime (RLS applies). */
export function useNotificationsRealtime() {
  const uid = useAuth().session?.user.id;
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        void qc.invalidateQueries({ queryKey: notificationKeys.list });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, qc]);
}
