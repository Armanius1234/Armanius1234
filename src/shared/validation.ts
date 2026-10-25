/**
 * Input rules shared by the app. The database enforces the same rules with
 * CHECK constraints (supabase/migrations), so the server stays the authority.
 */
import { z } from 'zod';

export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'support', 'help', 'pl8', 'pl8app',
  'official', 'team', 'staff', 'moderator', 'mod', 'security', 'system',
  'api', 'www', 'settings', 'privacy', 'terms', 'legal', 'impressum',
  'search', 'discover', 'messages', 'notifications', 'verify', 'verified',
] as const;

const USERNAME_RE = /^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/;

/** Error keys map to translations in src/i18n. */
export type ValidationKey =
  | 'required'
  | 'email_invalid'
  | 'password_short'
  | 'password_weak'
  | 'passwords_mismatch'
  | 'username_format'
  | 'username_reserved'
  | 'display_name_length'
  | 'bio_length'
  | 'city_length'
  | 'url_instagram'
  | 'url_tiktok'
  | 'url_linkedin'
  | 'url_facebook'
  | 'code_invalid'
  | 'age_required'
  | 'terms_required';

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, '');
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine((v) => USERNAME_RE.test(v) && !/[._]{2}/.test(v), { message: 'username_format' })
  .refine((v) => !(RESERVED_USERNAMES as readonly string[]).includes(v), {
    message: 'username_reserved',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'required')
  .pipe(z.email({ message: 'email_invalid' }));

export const PASSWORD_MIN = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'password_short')
  .max(72, 'password_short')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), { message: 'password_weak' });

export const otpSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{6,10}$/, 'code_invalid');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'display_name_length')
  .max(50, 'display_name_length');

export const bioSchema = z.string().max(300, 'bio_length');

/** Empty input means "not set" (null). */
export const citySchema = z
  .string()
  .trim()
  .max(60, 'city_length')
  .transform((v) => (v === '' ? null : v));

// ---------------------------------------------------------------- socials ---

export type SocialNetwork = 'instagram' | 'tiktok' | 'linkedin' | 'facebook';

const SOCIAL_URL_RE: Record<SocialNetwork, RegExp> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._]{2,24}\/?$/,
  linkedin: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9_-]{3,100}\/?$/,
  facebook: /^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9.]{5,50}\/?$/,
};

const HANDLE_RE: Record<SocialNetwork, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  linkedin: /^[A-Za-z0-9_-]{3,100}$/,
  facebook: /^[A-Za-z0-9.]{5,50}$/,
};

/**
 * Accepts a pasted link ("instagram.com/x", "http://…") or a bare handle
 * ("@x", "x") and returns the canonical https URL, or null if invalid.
 * Empty input returns '' (meaning "remove").
 */
export function normalizeSocialUrl(network: SocialNetwork, input: string): string | null {
  const raw = input.trim();
  if (raw === '') return '';

  let candidate = raw;
  if (!/^[a-z]+:\/\//i.test(candidate) && /\.(com)\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  candidate = candidate.replace(/^http:\/\//i, 'https://');

  if (/^https:\/\//i.test(candidate)) {
    // Strip query strings / fragments, lower-case the host only.
    const noQuery = candidate.split(/[?#]/)[0] ?? '';
    const match = /^https:\/\/([^/]+)(\/.*)?$/i.exec(noQuery);
    if (!match) return null;
    const url = `https://${(match[1] ?? '').toLowerCase()}${match[2] ?? ''}`;
    return SOCIAL_URL_RE[network].test(url) ? url.replace(/\/$/, '') : null;
  }

  // Bare handle
  const handle = raw.replace(/^@/, '');
  if (!HANDLE_RE[network].test(handle)) return null;
  switch (network) {
    case 'instagram':
      return `https://instagram.com/${handle}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'linkedin':
      return `https://www.linkedin.com/in/${handle}`;
    case 'facebook':
      return `https://facebook.com/${handle}`;
  }
}

export function isValidSocialUrl(network: SocialNetwork, url: string): boolean {
  return SOCIAL_URL_RE[network].test(url);
}

// ------------------------------------------------------------------ forms ---

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'required'),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    ageConfirmed: z.boolean().refine((v) => v, { message: 'age_required' }),
    termsAccepted: z.boolean().refine((v) => v, { message: 'terms_required' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords_mismatch',
    path: ['confirmPassword'],
  });

export const resetPasswordSchema = z
  .object({
    code: otpSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'passwords_mismatch',
    path: ['confirmPassword'],
  });

export type FieldErrors<T extends string = string> = Partial<Record<T, ValidationKey>>;

/** Turns a Zod result into { field: firstErrorKey }. */
export function fieldErrors<T extends string>(error: z.ZodError): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '_') as T;
    if (!out[field]) out[field] = issue.message as ValidationKey;
  }
  return out;
}
