/** Short relative time ("now", "5 min", "3 h", "2 d", then a date). */
export type TimeAgo =
  | { unit: 'now' }
  | { unit: 'minutes' | 'hours' | 'days'; n: number }
  | { unit: 'date'; date: Date };

export function timeAgo(iso: string, now = new Date()): TimeAgo {
  const date = new Date(iso);
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return { unit: 'now' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: 'minutes', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', n: hours };
  const days = Math.floor(hours / 24);
  if (days < 7) return { unit: 'days', n: days };
  return { unit: 'date', date };
}

/** Compact counts: 999, 1.2K, 3.4M. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(Math.floor(n / 100) / 10).toString().replace(/\.0$/, '')}K`;
  return `${(Math.floor(n / 100_000) / 10).toString().replace(/\.0$/, '')}M`;
}
