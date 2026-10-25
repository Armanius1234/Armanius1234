import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import type { ReportQueueItem, ReportReason, ReportTarget } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export const moderationKeys = {
  mine: ['reports', 'mine'] as const,
  queue: ['admin', 'reports'] as const,
  orphans: ['admin', 'orphans'] as const,
  suspended: ['admin', 'suspended'] as const,
};

/** Opens the report screen for any reportable item. */
export function openReport(type: ReportTarget, id: string) {
  router.push({ pathname: '/report', params: { type, id } });
}

export function useReportContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: ReportTarget; id: string; reason: ReportReason; details: string }) => {
      const { data, error } = await supabase.rpc('report_content', {
        p_type: input.type,
        p_target: input.id,
        p_reason: input.reason,
        p_details: input.details.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: moderationKeys.mine }),
  });
}

export function useMyReports() {
  return useQuery({
    queryKey: moderationKeys.mine,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_reports');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReportsQueue(enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.queue,
    enabled,
    queryFn: async (): Promise<ReportQueueItem[]> => {
      const { data, error } = await supabase.rpc('admin_reports_queue');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; action: 'dismiss' | 'remove' | 'suspend'; note: string }) => {
      const { error } = await supabase.rpc('admin_resolve_report', {
        p_report: input.reportId,
        p_action: input.action,
        p_note: input.note.trim() || null,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: moderationKeys.queue });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/** Files nothing points to any more, and a button to delete them (admins only). */
export function useStorageCleanup(enabled: boolean) {
  const qc = useQueryClient();
  const orphans = useQuery({
    queryKey: moderationKeys.orphans,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_orphaned_files', { p_limit: 500 });
      if (error) throw error;
      return data ?? [];
    },
  });
  const run = useMutation({
    mutationFn: async () => {
      const byBucket = new Map<string, string[]>();
      for (const f of orphans.data ?? []) {
        byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
      }
      for (const [bucket, paths] of byBucket) {
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
          if (error) throw error;
        }
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: moderationKeys.orphans }),
  });
  return { orphans, run };
}

export function useSuspendedUsers(enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.suspended,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_suspended_users');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUnsuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; note: string }) => {
      const { error } = await supabase.rpc('admin_unsuspend_user', { p_user: input.userId, p_note: input.note.trim() });
      if (error) throw error;
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: moderationKeys.suspended }),
  });
}
