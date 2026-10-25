import type { TKey, TParams } from '@/i18n';
import type { NotificationItem, ReportReason, ReportTarget } from '@/lib/database.types';

const TARGETS: readonly ReportTarget[] = ['user', 'post', 'comment', 'message', 'vehicle'];
const REASONS: readonly ReportReason[] = [
  'spam',
  'harassment',
  'hate',
  'nudity',
  'violence',
  'impersonation',
  'privacy',
  'illegal',
  'other',
];

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return list.find((x) => x === value) ?? fallback;
}

/** The sentence shown for a notification, in the user's language. */
export function notificationText(t: (k: TKey, p?: TParams) => string, n: NotificationItem) {
  return t(`notifications.${n.type}`, {
    name: n.actor_display_name ?? 'PL8',
    excerpt: typeof n.data.excerpt === 'string' ? n.data.excerpt : '',
    // Unknown values (e.g. from a newer server) fall back to a neutral word, never a raw key.
    target: t(`report.target_${pick(TARGETS, n.data.target_type, 'post')}`),
    reason: t(`report.reason_${pick(REASONS, n.data.reason, 'other')}`),
  });
}
