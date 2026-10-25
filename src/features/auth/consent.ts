import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { Locale } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/shared/legal';

const key = (uid: string | undefined) => ['consent', uid] as const;

/** Has this account confirmed 18+ and accepted the terms? (Email sign-ups always have.) */
export function useMyConsent() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: key(uid),
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_consent');
      if (error) throw error;
      return data === true;
    },
  });
}

export function useRecordConsent() {
  const uid = useAuth().session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locale: Locale) => {
      const { error } = await supabase.rpc('record_consent', {
        p_age_confirmed: true,
        p_terms_version: TERMS_VERSION,
        p_privacy_version: PRIVACY_VERSION,
        p_locale: locale,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.setQueryData(key(uid), true),
  });
}
