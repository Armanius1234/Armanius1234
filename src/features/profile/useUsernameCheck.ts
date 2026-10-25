import { useEffect, useMemo, useState } from 'react';

import { usernameSchema, type ValidationKey } from '@/shared/validation';

import { checkUsernameAvailable } from './api';

export type UsernameStatus =
  | { state: 'idle' }
  | { state: 'invalid'; reason: ValidationKey }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'error' };

type Local =
  | { kind: 'idle' }
  | { kind: 'invalid'; reason: ValidationKey }
  | { kind: 'unchanged' }
  | { kind: 'check'; value: string };

function localCheck(raw: string, current?: string): Local {
  if (raw.trim() === '') return { kind: 'idle' };
  const parsed = usernameSchema.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'invalid', reason: (parsed.error.issues[0]?.message ?? 'username_format') as ValidationKey };
  }
  if (current && parsed.data === current) return { kind: 'unchanged' };
  return { kind: 'check', value: parsed.data };
}

/** Validates locally, then asks the server (debounced) whether a username is free. */
export function useUsernameCheck(raw: string, current?: string, delayMs = 400): UsernameStatus {
  const local = useMemo(() => localCheck(raw, current), [raw, current]);
  const toCheck = local.kind === 'check' ? local.value : null;
  const [result, setResult] = useState<{ value: string; state: 'available' | 'taken' | 'error' } | null>(null);

  useEffect(() => {
    if (!toCheck) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkUsernameAvailable(toCheck)
        .then((ok) => {
          if (!cancelled) setResult({ value: toCheck, state: ok ? 'available' : 'taken' });
        })
        .catch(() => {
          if (!cancelled) setResult({ value: toCheck, state: 'error' });
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [toCheck, delayMs]);

  switch (local.kind) {
    case 'idle':
      return { state: 'idle' };
    case 'invalid':
      return { state: 'invalid', reason: local.reason };
    case 'unchanged':
      return { state: 'available' };
    case 'check':
      return result && result.value === local.value ? { state: result.state } : { state: 'checking' };
  }
}
