/**
 * Turns errors from Supabase (Auth, PostgREST, Storage) or the network into
 * a translation key, so users always see a clear, localized message and
 * never raw server text.
 */
import type { TKey } from '@/i18n';

type ErrorLike = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
};

const AUTH_CODES: Record<string, TKey> = {
  invalid_credentials: 'errors.invalid_credentials',
  email_not_confirmed: 'errors.email_not_confirmed',
  user_already_exists: 'errors.user_exists',
  email_exists: 'errors.user_exists',
  weak_password: 'errors.weak_password',
  over_email_send_rate_limit: 'errors.rate_limited',
  over_request_rate_limit: 'errors.rate_limited',
  over_sms_send_rate_limit: 'errors.rate_limited',
  otp_expired: 'errors.code_expired',
  same_password: 'errors.same_password',
  email_address_invalid: 'errors.email_invalid',
};

export function errorKey(error: unknown): TKey {
  if (!error || typeof error !== 'object') return 'errors.unknown';
  const e = error as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';

  if (e.name === 'PhotoPermissionError') return 'errors.photo_permission';
  if (e.name === 'UploadError') return 'errors.upload_failed';
  if (code && AUTH_CODES[code]) return AUTH_CODES[code];

  // The sign-up trigger rejected the request (missing 18+ / consent).
  if (/PL8_(AGE_CONFIRMATION|CONSENT)_REQUIRED|Database error saving new user/i.test(message)) {
    return 'errors.signup_rejected';
  }

  // PostgREST / Postgres errors
  if (code === '23505' && /username/i.test(message)) return 'errors.username_taken';
  if (code === '42501' || e.status === 401 || e.status === 403) return 'errors.permission_denied';
  if (e.status === 429) return 'errors.rate_limited';

  if (/network request failed|failed to fetch|network error|timed? ?out/i.test(message)) {
    return 'errors.network';
  }
  return 'errors.unknown';
}
