/**
 * German district codes (Unterscheidungszeichen): the 1–3 letters before the
 * first hyphen of a plate. The list is in de-districts.json (727 codes).
 *
 * Sources (combined, so that no real plate is rejected):
 *  - "Kfz-Kennzeichen Deutschland", Senatsverwaltung für Wirtschaft, Technologie
 *    und Forschung Berlin, via the npm package german-license-plate-prefixes
 *    2.18.0. Licence: CC BY 3.0.
 *  - The npm package kennzeichen 0.1.6 (canida-software). Licence: MIT.
 *  Includes the official special codes (federal and state governments,
 *  Bundeswehr "Y", NATO "X", police "BP", THW).
 *
 * The database has the same list (private.de_districts, migration
 * 20261030090000_store_prep.sql). A database test compares both. A new code can
 * be added in the database right away (docs/SUPABASE-SETUP.md) and here in the
 * next app update.
 */
import codes from './de-districts.json';

export const DE_DISTRICTS: ReadonlySet<string> = new Set(codes);

export function isGermanDistrict(code: string): boolean {
  return DE_DISTRICTS.has(code);
}
