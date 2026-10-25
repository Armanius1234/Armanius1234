import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import type { ConversationInfo, InboxItem, Message } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

const PAGE = 30;

export const messageKeys = {
  inbox: ['inbox'] as const,
  unread: ['inbox', 'unread'] as const,
  info: (id: string) => ['conversation', id] as const,
  messages: (id: string) => ['messages', id] as const,
};

export function useInbox() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: messageKeys.inbox,
    enabled: !!uid,
    staleTime: 10_000,
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase.rpc('my_conversations');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Unread messages in accepted chats (tab badge). Requests are counted separately. */
export function useUnreadCount() {
  const inbox = useInbox();
  const items = inbox.data ?? [];
  return {
    unread: items.filter((i) => i.status === 'active').reduce((n, i) => n + i.unread_count, 0),
    requests: items.filter((i) => i.is_request_for_me).length,
  };
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: messageKeys.info(id),
    queryFn: async (): Promise<ConversationInfo | null> => {
      const { data, error } = await supabase.rpc('conversation_info', { p_conversation: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** Messages, newest first (for an inverted list). */
export function useMessages(id: string) {
  return useInfiniteQuery({
    queryKey: messageKeys.messages(id),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<Message[]> => {
      let q = supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.created_at : undefined),
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await supabase.rpc('start_conversation', { p_target: target });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: messageKeys.inbox }),
  });
}

export function useSendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc('send_message', { p_conversation: id, p_body: body.trim() });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.messages(id) });
      void qc.invalidateQueries({ queryKey: messageKeys.info(id) });
      void qc.invalidateQueries({ queryKey: messageKeys.inbox });
    },
  });
}

export function useRespondMessageRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accept: boolean) => {
      const { error } = await supabase.rpc('respond_message_request', { p_conversation: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.info(id) });
      void qc.invalidateQueries({ queryKey: messageKeys.inbox });
    },
  });
}

export function useMarkRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_conversation_read', { p_conversation: id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: messageKeys.inbox }),
  });
}

export function useUnsendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKeys.messages(id) });
      void qc.invalidateQueries({ queryKey: messageKeys.inbox });
    },
  });
}

/** Deletes the chat for you only. A new message brings it back. */
export function useHideConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('hide_conversation', { p_conversation: id });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: messageKeys.messages(id) });
      void qc.invalidateQueries({ queryKey: messageKeys.inbox });
    },
  });
}

/**
 * One live subscription for the whole signed-in app. Supabase Realtime only
 * delivers messages the user is allowed to read (same RLS as normal reads).
 */
export function useMessagesRealtime() {
  const uid = useAuth().session?.user.id;
  const qc = useQueryClient();
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`messages:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const conversationId = (payload.new as Partial<Message>).conversation_id;
        void qc.invalidateQueries({ queryKey: messageKeys.inbox });
        if (conversationId) {
          void qc.invalidateQueries({ queryKey: messageKeys.messages(conversationId) });
          void qc.invalidateQueries({ queryKey: messageKeys.info(conversationId) });
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [uid, qc]);
}
