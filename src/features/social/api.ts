import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { FeedMode, FeedPost, FollowListItem, PostComment } from '@/lib/database.types';
import { readBytes, randomFileName, UploadError, type PreparedImage } from '@/lib/images';
import { supabase } from '@/lib/supabase';

const PAGE = 15;

export const socialKeys = {
  relationship: (target: string) => ['relationship', target] as const,
  follows: (user: string, kind: string) => ['follows', user, kind] as const,
  requests: ['follow-requests'] as const,
  feed: (mode: FeedMode, user?: string) => ['feed', mode, user ?? ''] as const,
  post: (id: string) => ['post', id] as const,
  comments: (id: string) => ['comments', id] as const,
};

function useUid() {
  return useAuth().session?.user.id;
}

// ----------------------------------------------------------------- follows --

export function useRelationship(target: string | undefined, enabled = true) {
  return useQuery({
    queryKey: socialKeys.relationship(target ?? ''),
    enabled: !!target && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('relationship', { p_target: target! });
      if (error) throw error;
      return data?.[0] ?? { following: false, requested: false, follows_me: false, requested_me: false };
    },
  });
}

function useInvalidateSocial() {
  const qc = useQueryClient();
  return (target?: string) => {
    if (target) void qc.invalidateQueries({ queryKey: socialKeys.relationship(target) });
    void qc.invalidateQueries({ queryKey: ['profile'] });
    void qc.invalidateQueries({ queryKey: ['follows'] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
    void qc.invalidateQueries({ queryKey: ['vehicles'] });
    void qc.invalidateQueries({ queryKey: socialKeys.requests });
  };
}

export function useFollow() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (target: string) => {
      const { data, error } = await supabase.rpc('follow_user', { p_target: target });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, target) => invalidate(target),
  });
}

/** Unfollow, or withdraw a pending request. */
export function useUnfollow() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (target: string) => {
      const { error } = await supabase.rpc('unfollow_user', { p_target: target });
      if (error) throw error;
    },
    onSuccess: (_d, target) => invalidate(target),
  });
}

export function useRemoveFollower() {
  const uid = useUid();
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async (follower: string) => {
      const { error } = await supabase.from('follows').delete().eq('follower_id', follower).eq('followee_id', uid!);
      if (error) throw error;
    },
    onSuccess: (_d, follower) => invalidate(follower),
  });
}

export function useFollowList(userId: string, kind: 'followers' | 'following') {
  return useInfiniteQuery({
    queryKey: socialKeys.follows(userId, kind),
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FollowListItem[]> => {
      const { data, error } = await supabase.rpc('list_follows', {
        p_user: userId,
        p_kind: kind,
        p_before: pageParam,
        p_limit: 30,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last) => (last.length === 30 ? last[last.length - 1]!.followed_at : undefined),
  });
}

export function useFollowRequests() {
  const uid = useUid();
  return useQuery({
    queryKey: socialKeys.requests,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_follow_requests');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRespondRequest() {
  const invalidate = useInvalidateSocial();
  return useMutation({
    mutationFn: async ({ requester, accept }: { requester: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_follow_request', { p_requester: requester, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidate(v.requester),
  });
}

// ------------------------------------------------------------------- feeds --

/** Paged feed (newest first). */
export function useFeed(mode: Exclude<FeedMode, 'single'>, userId?: string) {
  return useInfiniteQuery({
    queryKey: socialKeys.feed(mode, userId),
    enabled: mode !== 'user' || !!userId,
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }): Promise<FeedPost[]> => {
      const { data, error } = await supabase.rpc('get_posts', {
        p_mode: mode,
        p_user: userId ?? null,
        p_before: pageParam?.at ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: PAGE,
      });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === PAGE && tail ? { at: tail.published_at, id: tail.post_id } : undefined;
    },
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: socialKeys.post(id),
    queryFn: async (): Promise<FeedPost | null> => {
      const { data, error } = await supabase.rpc('get_posts', { p_mode: 'single', p_post: id });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

// ------------------------------------------------------------------- posts --

export type NewPost = { images: PreparedImage[]; caption: string; vehicleId: string | null };

/**
 * Create a draft → upload photos → attach them → publish.
 * If anything fails, the draft and its uploaded photos are removed again.
 */
export function useCreatePost() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ images, caption, vehicleId }: NewPost) => {
      if (!uid) throw new Error('Not signed in');
      const { data: post, error } = await supabase
        .from('posts')
        .insert({ author_id: uid, caption: caption.trim(), vehicle_id: vehicleId })
        .select('id')
        .single();
      if (error) throw error;

      const uploaded: string[] = [];
      try {
        for (const [position, image] of images.entries()) {
          const path = `${post.id}/${randomFileName()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from('post-media')
            .upload(path, await readBytes(image.uri), { contentType: 'image/jpeg', upsert: false });
          if (upErr) throw new UploadError(upErr);
          uploaded.push(path);
          const { error: mediaErr } = await supabase.from('post_media').insert({
            post_id: post.id,
            storage_path: path,
            position,
            width: image.width,
            height: image.height,
          });
          if (mediaErr) throw mediaErr;
        }
        const { error: pubErr } = await supabase.rpc('publish_post', { p_post_id: post.id });
        if (pubErr) throw pubErr;
        return post.id;
      } catch (e) {
        if (uploaded.length) await supabase.storage.from('post-media').remove(uploaded);
        await supabase.from('posts').delete().eq('id', post.id);
        throw e;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (post: Pick<FeedPost, 'post_id' | 'media_paths'>) => {
      if (post.media_paths.length) await supabase.storage.from('post-media').remove(post.media_paths);
      const { error } = await supabase.from('posts').delete().eq('id', post.post_id);
      if (error) throw error;
    },
    onSuccess: (_d, post) => {
      qc.removeQueries({ queryKey: socialKeys.post(post.post_id) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUpdateCaption(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caption: string) => {
      const { error } = await supabase.from('posts').update({ caption: caption.trim() }).eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: socialKeys.post(postId) });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useToggleLike() {
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ postId, like }: { postId: string; like: boolean }) => {
      const { error } = like
        ? await supabase.from('likes').insert({ user_id: uid!, post_id: postId })
        : await supabase.from('likes').delete().eq('user_id', uid!).eq('post_id', postId);
      // Double taps: "already liked" counts as success.
      if (error && error.code !== '23505') throw error;
    },
  });
}

export function useToggleSave() {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, save }: { postId: string; save: boolean }) => {
      const { error } = save
        ? await supabase.from('saved_posts').insert({ user_id: uid!, post_id: postId })
        : await supabase.from('saved_posts').delete().eq('user_id', uid!).eq('post_id', postId);
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: socialKeys.feed('saved') }),
  });
}

// ---------------------------------------------------------------- comments --

export function useComments(postId: string) {
  return useQuery({
    queryKey: socialKeys.comments(postId),
    queryFn: async (): Promise<PostComment[]> => {
      const { data, error } = await supabase.rpc('get_comments', { p_post: postId, p_limit: 100 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddComment(postId: string) {
  const uid = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: uid!, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      void qc.invalidateQueries({ queryKey: socialKeys.post(postId) });
    },
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: socialKeys.comments(postId) });
      void qc.invalidateQueries({ queryKey: socialKeys.post(postId) });
    },
  });
}
