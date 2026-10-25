import vectors from '../../supabase/tests/plate_vectors.json';

import {
  formatPlate,
  normalizePlateDE,
  parseCanonical,
  plateError,
  plateInputFilters,
  type PlateSuffix,
} from '@/shared/plate';
import { DE_DISTRICTS } from '@/shared/plateDistricts';

type Vector = { d: string; l: string; n: string; s: string; expected: string | null };

describe('normalizePlateDE (same cases as the database test)', () => {
  it.each(vectors as Vector[])('$d|$l|$n|$s → $expected', (v) => {
    expect(
      normalizePlateDE({ district: v.d, letters: v.l, digits: v.n, suffix: v.s as PlateSuffix }),
    ).toBe(v.expected);
  });
});

describe('plateError', () => {
  it('points at the wrong part', () => {
    expect(plateError({ district: 'F1', letters: 'AB', digits: '1', suffix: '' })).toBe('district');
    expect(plateError({ district: 'F', letters: 'ABC', digits: '1', suffix: '' })).toBe('letters');
    expect(plateError({ district: 'F', letters: 'AB', digits: '0', suffix: '' })).toBe('digits');
    expect(plateError({ district: 'MTK', letters: 'AB', digits: '1234', suffix: '' })).toBe('too_long');
    expect(plateError({ district: 'F', letters: 'AB', digits: '1', suffix: '' })).toBeNull();
  });

  it('rejects district codes that do not exist, before checking the rest', () => {
    expect(plateError({ district: 'XX', letters: '', digits: '', suffix: '' })).toBe('unknown_district');
    expect(plateError({ district: 'FFM', letters: 'AB', digits: '1', suffix: '' })).toBe('unknown_district');
    expect(plateError({ district: 'mtk', letters: 'AB', digits: '1', suffix: '' })).toBeNull();
  });
});

describe('district list', () => {
  it('has 727 unique codes in the allowed format', () => {
    expect(DE_DISTRICTS.size).toBe(727);
    for (const code of DE_DISTRICTS) expect(code).toMatch(/^[A-ZÄÖÜ]{1,3}$/);
  });

  it('has the big cities, umlaut codes, reintroduced old codes and official codes', () => {
    for (const code of ['B', 'HH', 'M', 'K', 'F', 'S', 'WI', 'MTK', 'LÖ', 'MÜ', 'AÖ', 'SÄK', 'UER', 'ZZ', 'Y', 'BP']) {
      expect(DE_DISTRICTS.has(code)).toBe(true);
    }
    for (const code of ['XX', 'FFM', 'QQ', 'KÖ', 'Ä']) expect(DE_DISTRICTS.has(code)).toBe(false);
  });
});

describe('formatting', () => {
  it('writes plates the way they look on the car', () => {
    expect(formatPlate('F-AB-123E')).toBe('F-AB 123E');
    expect(formatPlate('WI-FA-480')).toBe('WI-FA 480');
  });

  it('round-trips canonical plates', () => {
    expect(parseCanonical('LÖ-AB-12H')).toEqual({ district: 'LÖ', letters: 'AB', digits: '12', suffix: 'H' });
    expect(parseCanonical('nonsense')).toBeNull();
  });
});

describe('input filters', () => {
  it('only keeps allowed characters while typing', () => {
    expect(plateInputFilters.district('wi1-')).toBe('WI');
    expect(plateInputFilters.district('mühl')).toBe('MÜH');
    expect(plateInputFilters.letters('ä b c')).toBe('BC');
    expect(plateInputFilters.digits('0048a12')).toBe('4812');
  });
});
