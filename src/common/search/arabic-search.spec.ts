import { BadRequestException } from '@nestjs/common';
import { NORMALIZER_FIXTURES, likePattern, normalizeArabic, resolveSearchQuery } from './arabic-search';

describe('Arabic search helpers', () => {
  it('normalizes Arabic spelling, diacritics, Persian letters, digits, and spacing', () => {
    expect(normalizeArabic('  إِلـى  یَوم ۱۲٣! ')).toBe('الي يوم 123');
  });

  it('does not collapse taa marbuta into haa', () => {
    expect(normalizeArabic('مدرسة')).not.toBe(normalizeArabic('مدرسه'));
  });

  it('accepts the deprecated alias when values normalize equally', () => {
    expect(resolveSearchQuery({ q: 'إسلام', search: 'اسلام' })).toBe('إسلام');
  });

  it('rejects conflicting q and search values', () => {
    expect(() => resolveSearchQuery({ q: 'رياضيات', search: 'فيزياء' })).toThrow(BadRequestException);
  });

  it('normalizes punctuation out of a LIKE pattern', () => {
    expect(likePattern(' إسلام%_\\ ')).toBe('%اسلام%');
  });

  // Presentation forms (U+FB50-U+FEFF) are common in text pasted out of PDFs.
  // NFKC folds them to the ordinary letters the content is stored with; the SQL
  // twin must do the same or the needle can never match the indexed value.
  it('folds Arabic presentation forms via NFKC', () => {
    expect(normalizeArabic('ﻻ')).toBe('لا');
    expect(normalizeArabic('ﻣﺪﺭﺳﺔ')).toBe(normalizeArabic('مدرسة'));
  });

  it('keeps letters that are not diacritics', () => {
    // U+066E/U+066F are Arabic letters, not marks, and must survive.
    expect(normalizeArabic('اٮٯ')).toBe('اٮٯ');
  });

  it('exposes fixtures whose expectations are derived from the implementation', () => {
    expect(NORMALIZER_FIXTURES.length).toBeGreaterThan(0);
    for (const [input, expected] of NORMALIZER_FIXTURES) {
      expect(normalizeArabic(input)).toBe(expected);
    }
  });
});
