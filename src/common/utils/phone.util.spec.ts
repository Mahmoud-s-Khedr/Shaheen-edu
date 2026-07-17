import { normalizeEgyptianPhone, isValidEgyptianPhone } from './phone.util';

describe('normalizeEgyptianPhone', () => {
  const canonical = '01012345678';

  it('leaves an already-canonical number unchanged', () => {
    expect(normalizeEgyptianPhone('01012345678')).toBe(canonical);
  });

  it('normalizes +20-prefixed numbers', () => {
    expect(normalizeEgyptianPhone('+201012345678')).toBe(canonical);
  });

  it('normalizes 0020-prefixed numbers', () => {
    expect(normalizeEgyptianPhone('00201012345678')).toBe(canonical);
  });

  it('normalizes bare-20-prefixed numbers', () => {
    expect(normalizeEgyptianPhone('201012345678')).toBe(canonical);
  });

  it('strips spaces and dashes', () => {
    expect(normalizeEgyptianPhone('010-1234-5678')).toBe(canonical);
    expect(normalizeEgyptianPhone('010 1234 5678')).toBe(canonical);
  });

  it('strips parens', () => {
    expect(normalizeEgyptianPhone('(010) 1234-5678')).toBe(canonical);
  });
});

describe('isValidEgyptianPhone', () => {
  it('accepts valid Egyptian mobile prefixes', () => {
    expect(isValidEgyptianPhone('01012345678')).toBe(true);
    expect(isValidEgyptianPhone('01112345678')).toBe(true);
    expect(isValidEgyptianPhone('01212345678')).toBe(true);
    expect(isValidEgyptianPhone('01512345678')).toBe(true);
  });

  it('rejects an invalid prefix', () => {
    expect(isValidEgyptianPhone('01312345678')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidEgyptianPhone('0101234567')).toBe(false);
  });
});
