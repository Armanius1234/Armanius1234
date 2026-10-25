import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { MessagingPolicy, Profile, ProfileUpdate, UserSettings } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export const profileKeys = {
  me: (uid: string | undefined) => ['profile', 'me', uid] as const,
  byUsername: (username: string) => ['profile', 'username', username] as const,
  settings: (uid: string | undefined) => ['settings', uid] as const,
  blocked: (uid: string | undefined) => ['blocked', uid] as const,
};

function useUid(): string | undefined {
  return useAuth().session?.user.id;
}

/** The signed-in user's profile, or null if onboarding is not finished. */
export function useMyProfile() {
  const uid = useUid();
  return useQuery({
    queryKey: profileKeys.me(uid),
    enabled: !!uid,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Another user's profile. Returns null when it does not exist or is hidden (blocked). */
export function useProfileByUsername(username: string) {
  return useQuery({
    queryKey: profileKeys.byUsername(username),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export async function checkUsernameAvailable(candidate: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { candidate });
  if (error) throw error;
  return data === true;
}

export type NewProfile = {
  username: string;
  display_name: string;
  bio: string;
  city: string | null;
  avatar_path: string | null;
  is_private: boolean;
};

export function useCreateProfile() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewProfile): Promise<Profile> => {
      if (!uid) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('profiles')
        .insert({ id: uid, ...input })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      qc.setQueryData(profileKeys.me(uid), profile);
    },
  });
}

export function useUpdateProfile() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate): Promise<Profile> => {
      if (!uid) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', uid)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      qc.setQueryData(profileKeys.me(uid), profile);
      void qc.invalidateQueries({ queryKey: ['profile', 'username'] });
    },
  });
}

export function useMySettings() {
  const uid = useUid();
  return useQuery({
    queryKey: profileKeys.settings(uid),
    enabled: !!uid,
    queryFn: async (): Promise<UserSettings | null> => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateSettings() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { messaging_policy?: MessagingPolicy; locale?: 'de' | 'en' }) => {
      if (!uid) throw new Error('Not signed in');
      const { data, error } = await supabase
        .from('user_settings')
        .update(patch)
        .eq('user_id', uid)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (settings) => {
      qc.setQueryData(profileKeys.settings(uid), settings);
    },
  });
}

export function useBlockedUsers() {
  const uid = useUid();
  return useQuery({
    queryKey: profileKeys.blocked(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_blocked_users');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBlockUser() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase.from('blocks').insert({ blocker_id: uid, blocked_id: targetId });
      // Already blocked counts as success.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKeys.blocked(uid) });
      void qc.invalidateQueries({ queryKey: ['profile', 'username'] });
    },
  });
}

export function useUnblockUser() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetId: string) => {
      if (!uid) throw new Error('Not signed in');
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', uid)
        .eq('blocked_id', targetId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKeys.blocked(uid) });
      void qc.invalidateQueries({ queryKey: ['profile', 'username'] });
    },
  });
}

/** A profile by id. Null when it does not exist or is hidden (blocked). */
export function useProfileById(id: string | undefined) {
  return useQuery({
    queryKey: ['profile', 'id', id],
    enabled: !!id,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
