import { translate } from '@/i18n';
import { de } from '@/i18n/de';
import { en } from '@/i18n/en';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`),
  );
}

describe('translations', () => {
  it('German and English have exactly the same keys', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('no translation is empty', () => {
    for (const dict of [de, en]) {
      for (const key of keys(dict)) {
        const value = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], dict);
        expect(String(value).trim()).not.toBe('');
      }
    }
  });

  it('placeholders match between languages', () => {
    const placeholders = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort();
    for (const key of keys(en)) {
      const get = (d: object) => key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)[p], d);
      expect(placeholders(String(get(de)))).toEqual(placeholders(String(get(en))));
    }
  });

  it('fills parameters', () => {
    expect(translate('en', 'onboarding.step', { current: 1, total: 3 })).toBe('Step 1 of 3');
    expect(translate('de', 'onboarding.step', { current: 2, total: 3 })).toBe('Schritt 2 von 3');
  });

  it('keeps the brand slogan identical in both languages', () => {
    expect(translate('de', 'brand.tagline')).toBe('Every car has a story.');
    expect(translate('en', 'brand.tagline')).toBe('Every car has a story.');
  });
});
