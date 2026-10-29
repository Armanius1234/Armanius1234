/**
 * Appeals against moderation decisions (EU DSA Art. 20) and the moderation
 * statistics for the transparency report.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { TKey, TParams } from '@/i18n';
import type { AppealQueueItem, Decision, ModerationStats } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { moderationKeys } from './api';

export const appealKeys = {
  decisions: ['decisions'] as const,
  queue: ['admin', 'appeals'] as const,
  stats: (days: number) => ['admin', 'stats', days] as const,
};

type T = (key: TKey, params?: TParams) => string;

export function useMyDecisions() {
  return useQuery({
    queryKey: appealKeys.decisions,
    queryFn: async (): Promise<Decision[]> => {
      const { data, error } = await supabase.rpc('my_decisions');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmitAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reportId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('submit_appeal', { p_report: input.reportId, p_reason: input.reason.trim() });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: appealKeys.decisions }),
  });
}

export function useAppealsQueue(enabled: boolean) {
  return useQuery({
    queryKey: appealKeys.queue,
    enabled,
    queryFn: async (): Promise<AppealQueueItem[]> => {
      const { data, error } = await supabase.rpc('admin_appeals_queue');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDecideAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { appealId: string; outcome: 'upheld' | 'reversed'; note: string }) => {
      const { error } = await supabase.rpc('admin_decide_appeal', {
        p_appeal: input.appealId,
        p_outcome: input.outcome,
        p_note: input.note.trim(),
      });
      if (error) throw error;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: appealKeys.queue });
      void qc.invalidateQueries({ queryKey: moderationKeys.queue });
      void qc.invalidateQueries({ queryKey: moderationKeys.suspended });
      void qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useModerationStats(enabled: boolean, days: number) {
  return useQuery({
    queryKey: appealKeys.stats(days),
    enabled,
    queryFn: async (): Promise<ModerationStats> => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const { data, error } = await supabase.rpc('admin_moderation_stats', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return data as unknown as ModerationStats;
    },
  });
}

/** Can this decision still be appealed (no appeal yet, within 6 months)? */
export function canAppeal(d: Decision, now: Date = new Date()): boolean {
  return !d.appeal_id && new Date(d.appeal_until) > now;
}

/** "Your post was removed", "Your account was suspended", … */
export function decisionTitle(t: T, d: Decision): string {
  const target = t(`report.target_${d.target_type}`);
  if (d.role === 'reporter') return t('appeal.reporter_dismiss', { target });
  return d.action === 'suspend' ? t('appeal.owner_suspend') : t('appeal.owner_remove', { target });
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Plain CSV (metric, value) of the statistics, ready for a transparency report. */
export function statsToCsv(s: ModerationStats): string {
  const rows: [string, string | number | null][] = [
    ['period_from', s.from],
    ['period_to', s.to],
    ['reports_received', s.reports_received],
    ...Object.entries(s.reports_by_reason).map(([k, v]) => [`reports_reason_${k}`, v ?? 0] as [string, number]),
    ...Object.entries(s.reports_by_target).map(([k, v]) => [`reports_type_${k}`, v ?? 0] as [string, number]),
    ...Object.entries(s.decisions).map(([k, v]) => [`decisions_${k}`, v ?? 0] as [string, number]),
    ['median_hours_to_decision', s.median_hours_to_decision],
    ['appeals_received', s.appeals_received],
    ['appeals_upheld', s.appeals_upheld],
    ['appeals_reversed', s.appeals_reversed],
    ['appeals_open', s.appeals_open],
    ['accounts_suspended_now', s.accounts_suspended_now],
  ];
  return ['metric,value', ...rows.map(([k, v]) => `${csvCell(k)},${csvCell(v)}`)].join('\n') + '\n';
}

export async function shareStatsCsv(s: ModerationStats, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, `pl8-moderation-${s.to.slice(0, 10)}.csv`);
  file.create({ overwrite: true });
  await file.write(statsToCsv(s));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle, UTI: 'public.comma-separated-values-text' });
  }
}
