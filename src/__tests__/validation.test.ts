import {
  emailSchema,
  isValidSocialUrl,
  normalizeSocialUrl,
  otpSchema,
  passwordSchema,
  registerSchema,
  usernameSchema,
} from '@/shared/validation';

describe('usernameSchema', () => {
  it.each(['alice', 'bmw.m2', 'rs_6', 'a1b', 'x'.repeat(30)])('accepts %s', (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(true);
  });

  it('normalizes case, whitespace and a leading @', () => {
    expect(usernameSchema.parse('  @Alice_M2 ')).toBe('alice_m2');
  });

  it.each([
    ['ab', 'username_format'],
    ['x'.repeat(31), 'username_format'],
    ['_alice', 'username_format'],
    ['alice.', 'username_format'],
    ['a..b', 'username_format'],
    ['a._b', 'username_format'],
    ['al ice', 'username_format'],
    ['älice', 'username_format'],
    ['admin', 'username_reserved'],
    ['PL8', 'username_reserved'],
  ])('rejects %s (%s)', (name, reason) => {
    const r = usernameSchema.safeParse(name);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(reason);
  });
});

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Max@Example.DE ')).toBe('max@example.de');
  });
  it('rejects invalid addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('').error?.issues[0]?.message).toBe('required');
  });
});

describe('passwordSchema', () => {
  it('requires 10+ chars with letters and digits', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').error?.issues[0]?.message).toBe('password_weak');
    expect(passwordSchema.safeParse('1234567890').error?.issues[0]?.message).toBe('password_weak');
    expect(passwordSchema.safeParse('carlover2026').success).toBe(true);
  });
});

describe('otpSchema', () => {
  it('accepts 6–10 digit codes only', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(otpSchema.safeParse(' 12345678 ').success).toBe(true);
    expect(otpSchema.safeParse('12345').success).toBe(false);
    expect(otpSchema.safeParse('12a456').success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    email: 'max@example.de',
    password: 'carlover2026',
    confirmPassword: 'carlover2026',
    ageConfirmed: true,
    termsAccepted: true,
  };

  it('accepts a complete form', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('requires 18+ confirmation', () => {
    const r = registerSchema.safeParse({ ...valid, ageConfirmed: false });
    expect(r.error?.issues.map((i) => i.message)).toContain('age_required');
  });

  it('requires terms acceptance', () => {
    const r = registerSchema.safeParse({ ...valid, termsAccepted: false });
    expect(r.error?.issues.map((i) => i.message)).toContain('terms_required');
  });

  it('requires matching passwords', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'different2026' });
    expect(r.error?.issues[0]).toMatchObject({ message: 'passwords_mismatch', path: ['confirmPassword'] });
  });
});

describe('normalizeSocialUrl', () => {
  it.each([
    ['instagram', '@m2.wiesbaden', 'https://instagram.com/m2.wiesbaden'],
    ['instagram', 'instagram.com/m2.wiesbaden/', 'https://instagram.com/m2.wiesbaden'],
    ['instagram', 'http://www.Instagram.com/m2.wiesbaden?igsh=abc', 'https://www.instagram.com/m2.wiesbaden'],
    ['tiktok', 'carspotter_ffm', 'https://www.tiktok.com/@carspotter_ffm'],
    ['tiktok', 'https://www.tiktok.com/@carspotter_ffm', 'https://www.tiktok.com/@carspotter_ffm'],
    ['linkedin', 'max-mustermann', 'https://www.linkedin.com/in/max-mustermann'],
    ['linkedin', 'https://de.linkedin.com/in/max-mustermann/', 'https://de.linkedin.com/in/max-mustermann'],
    ['facebook', 'max.mustermann', 'https://facebook.com/max.mustermann'],
  ] as const)('%s: %s → %s', (network, input, expected) => {
    expect(normalizeSocialUrl(network, input)).toBe(expected);
  });

  it('returns empty string for empty input (= remove link)', () => {
    expect(normalizeSocialUrl('instagram', '   ')).toBe('');
  });

  it.each([
    ['instagram', 'javascript:alert(1)'],
    ['instagram', 'https://evil.example/instagram.com/x'],
    ['instagram', 'https://instagram.com.evil.example/x'],
    ['facebook', 'https://facebook.com/a'],
    ['linkedin', 'https://linkedin.com/feed/'],
    ['tiktok', 'https://tiktok.com/notahandle'],
  ] as const)('rejects %s: %s', (network, input) => {
    expect(normalizeSocialUrl(network, input)).toBeNull();
  });

  it('every normalized URL passes the same check the database uses', () => {
    const url = normalizeSocialUrl('instagram', '@rs6.avant');
    expect(url && isValidSocialUrl('instagram', url)).toBe(true);
  });
});
