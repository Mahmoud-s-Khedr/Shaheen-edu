import { nodeMatches, searchableStrings } from './node-match';

describe('nodeMatches', () => {
  const prismaRecord = {
    titleAr: 'إسلاميات',
    titleEn: 'Islamic Studies',
    slug: 'islamic',
  };
  // What gradeDto() emits: localized objects, and no flat titleAr/titleEn.
  const gradeDto = {
    id: 'g1',
    title: { ar: 'الصف الأول', en: 'Grade One' },
    slug: 'grade-one',
    description: { ar: 'وصف', en: 'Description' },
  };

  it('reads localized title objects, not just top-level strings', () => {
    // The regression: only `slug` used to be reachable on a grade DTO, so
    // searching a grade by its Arabic name matched nothing.
    expect(searchableStrings(gradeDto)).toEqual(
      expect.arrayContaining(['الصف الأول', 'Grade One', 'وصف', 'Description']),
    );
    expect(nodeMatches(gradeDto, 'الصف')).toBe(true);
    expect(nodeMatches(gradeDto, 'Grade One')).toBe(true);
  });

  it('still reads flat Prisma records', () => {
    expect(nodeMatches(prismaRecord, 'إسلاميات')).toBe(true);
    expect(nodeMatches(prismaRecord, 'Islamic')).toBe(true);
  });

  it('normalizes both sides so it agrees with the SQL-backed endpoints', () => {
    // Bare alef must match the hamza-carrying stored form, as `subjects()` does.
    expect(nodeMatches(prismaRecord, 'اسلام')).toBe(true);
    expect(nodeMatches({ title: 'مُعَلَّم' }, 'معلم')).toBe(true);
    expect(nodeMatches({ title: 'الفصل ١٢' }, 'الفصل 12')).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(nodeMatches(prismaRecord, 'رياضيات')).toBe(false);
  });

  it('treats an absent or unsearchable query as "match everything"', () => {
    expect(nodeMatches(prismaRecord, undefined)).toBe(true);
    expect(nodeMatches(prismaRecord, '!!!')).toBe(true);
  });

  it('tolerates null and non-object nodes', () => {
    expect(searchableStrings(null)).toEqual([]);
    expect(nodeMatches(null, 'x')).toBe(false);
  });
});
