/**
 * Finding people and cars: search, suggestions, @mention helpers.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import type { PersonResult, Suggestion, VehicleResult } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export const discoveryKeys = {
  people: (q: string) => ['search', 'people', q] as const,
  vehicles: (q: string) => ['search', 'vehicles', q] as const,
  suggestions: (uid: string | undefined) => ['suggestions', uid] as const,
};

/** The value, but only after it stopped changing for `ms` (typing). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** What the server will search for: trimmed, without a leading "@". */
export function cleanQuery(q: string): string {
  return q.trim().replace(/^@+/, '').toLowerCase();
}

export function usePeopleSearch(query: string, limit = 20) {
  const q = cleanQuery(query);
  return useQuery({
    queryKey: [...discoveryKeys.people(q), limit],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<PersonResult[]> => {
      const { data, error } = await supabase.rpc('search_people', { p_query: q, p_limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVehicleSearch(query: string) {
  const q = query.trim().toLowerCase();
  return useQuery({
    queryKey: discoveryKeys.vehicles(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<VehicleResult[]> => {
      const { data, error } = await supabase.rpc('search_vehicles', { p_query: q });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSuggestedPeople() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: discoveryKeys.suggestions(uid),
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Suggestion[]> => {
      const { data, error } = await supabase.rpc('suggested_people', { p_limit: 10 });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ------------------------------------------------------------------ mentions

const MENTION_AT_END = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9._]{0,30})$/;

/** The name being typed right now ("@mi" at the end of the text), or null. */
export function mentionInProgress(text: string): string | null {
  const m = MENTION_AT_END.exec(text);
  return m ? m[2]! : null;
}

/** Replaces the name being typed with the chosen username. */
export function completeMention(text: string, username: string): string {
  return text.replace(MENTION_AT_END, (_all, before: string) => `${before}@${username} `);
}

export type TextPart = { text: string; mention?: string };

/** Splits a text into plain parts and @mentions (for tappable names). */
export function splitMentions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /(^|[^A-Za-z0-9_.@])@([A-Za-z0-9][A-Za-z0-9._]{1,28}[A-Za-z0-9])/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1]!.length;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: `@${m[2]}`, mention: m[2]!.toLowerCase() });
    last = start + 1 + m[2]!.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
