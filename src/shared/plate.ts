/**
 * German license plate handling. Mirrors private.normalize_plate_de in the
 * database (shared test cases: supabase/tests/plate_vectors.json).
 *
 * A German plate has three parts, and the separators matter:
 * "F-AB 123" and "FA-B 123" are different cars. That is why PL8 asks for the
 * parts separately instead of one free-text field.
 */

import { isGermanDistrict } from './plateDistricts';

export type PlateSuffix = '' | 'E' | 'H';

export type PlateParts = {
  district: string; // Unterscheidungszeichen, 1–3 letters (Ä/Ö/Ü allowed), must exist
  letters: string; // Erkennungsbuchstaben, 1–2 letters A–Z
  digits: string; // Erkennungszahl, 1–9999
  suffix: PlateSuffix; // E = electric, H = historic
};

export const EMPTY_PLATE: PlateParts = { district: '', letters: '', digits: '', suffix: '' };

export type PlateError = 'district' | 'unknown_district' | 'letters' | 'digits' | 'suffix' | 'too_long';

const DISTRICT_RE = /^[A-ZÄÖÜ]{1,3}$/;
const LETTERS_RE = /^[A-Z]{1,2}$/;
const DIGITS_RE = /^[1-9][0-9]{0,3}$/;

function clean(parts: PlateParts) {
  return {
    d: parts.district.trim().toUpperCase(),
    l: parts.letters.trim().toUpperCase(),
    n: parts.digits.trim(),
    s: parts.suffix.trim().toUpperCase(),
  };
}

/** First problem with the input, or null if it is a valid German plate. */
export function plateError(parts: PlateParts): PlateError | null {
  const { d, l, n, s } = clean(parts);
  if (!DISTRICT_RE.test(d)) return 'district';
  if (!isGermanDistrict(d)) return 'unknown_district';
  if (!LETTERS_RE.test(l)) return 'letters';
  if (!DIGITS_RE.test(n)) return 'digits';
  if (!/^[EH]?$/.test(s)) return 'suffix';
  if ((d + l + n + s).length > 8) return 'too_long';
  return null;
}

/** Canonical form stored by the server, e.g. "F-AB-123E", or null if invalid. */
export function normalizePlateDE(parts: PlateParts): string | null {
  if (plateError(parts)) return null;
  const { d, l, n, s } = clean(parts);
  return `${d}-${l}-${n}${s}`;
}

/** How a plate is written on the car: "F-AB 123E". */
export function formatPlate(canonical: string): string {
  const m = /^([A-ZÄÖÜ]{1,3})-([A-Z]{1,2})-([0-9]{1,4}[EH]?)$/.exec(canonical);
  return m ? `${m[1]}-${m[2]} ${m[3]}` : canonical;
}

/** Splits a canonical plate back into parts (for editing). */
export function parseCanonical(canonical: string): PlateParts | null {
  const m = /^([A-ZÄÖÜ]{1,3})-([A-Z]{1,2})-([0-9]{1,4})([EH]?)$/.exec(canonical);
  if (!m) return null;
  return { district: m[1]!, letters: m[2]!, digits: m[3]!, suffix: (m[4] ?? '') as PlateSuffix };
}

/** Input filters used while typing. */
export const plateInputFilters = {
  district: (v: string) => v.toUpperCase().replace(/[^A-ZÄÖÜ]/g, '').slice(0, 3),
  letters: (v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
  digits: (v: string) => v.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 4),
};
