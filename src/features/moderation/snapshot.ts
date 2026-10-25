import type { ReportQueueItem } from '@/lib/database.types';

type Content = NonNullable<ReportQueueItem['preview']>;

/** True when the content changed after it was reported (status flags ignored). */
export function changedSinceReport(item: Pick<ReportQueueItem, 'preview' | 'snapshot'>): boolean {
  if (!item.snapshot) return false;
  const strip = (c: Content | null) => {
    const { removed: _r, restricted: _x, suspended: _s, ...rest } = c ?? {};
    return JSON.stringify(rest);
  };
  return strip(item.snapshot) !== strip(item.preview);
}
