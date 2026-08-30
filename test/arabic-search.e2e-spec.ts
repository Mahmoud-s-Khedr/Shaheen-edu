import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { PrismaService } from '../src/database/prisma.service';
import { normalizeArabic } from '../src/common/search/arabic-search';

/**
 * The searchable text of every row is normalized by the PostgreSQL
 * `arabic_normalize()` function (it backs the GIN expression indexes), while
 * every needle is normalized by the JS `normalizeArabic()`. If the two ever
 * disagree, searches silently return wrong or empty results with no error
 * anywhere -- so their agreement is asserted directly, over a corpus that
 * exercises each branch.
 */
const CORPUS = [
  // empty / whitespace
  '',
  '   ',
  // diacritics and tatweel
  'إِسْلَامِيَات',
  'مُعَلَّم',
  'الرِّياضِيّات',
  'إلـى',
  'ـــمدـــ',
  '  إِلـى  یَوم ۱۲٣! ',
  // alef / yeh / keheh folding
  'أحمد',
  'إبراهيم',
  'آية',
  'مصطفى',
  'یَوم',
  'کتاب',
  // taa marbuta must NOT fold to haa
  'مدرسة',
  'مدرسه',
  // digits, both Arabic-Indic blocks
  '٠١٢٣٤٥٦٧٨٩',
  '۰۱۲۳۴۵۶۷۸۹',
  '0123456789',
  'الفصل ١٢',
  // NFKC presentation forms (pasted from PDFs)
  'ﻻ',
  'ﻲ',
  'ﷲ',
  'ﻣﺪﺭﺳﺔ',
  'ﻻ إله',
  'ﺍﻟﻜﺘﺎﺏ',
  // punctuation becomes a separator
  'رياضيات 100%_',
  'a٪b',
  'أ٪ب',
  '٪٫٬٭',
  'A_B-C',
  '---',
  '!!!',
  'test@example.com',
  'chapter_12',
  'CHAPTER-12',
  // letters that are not marks and must survive
  'اٮٯ',
  // mixed scripts
  'مرحبا! Hello, World?',
  'اللغة العربية',
  'café',
  'naïve',
  'Ελλάδα',
  'привет',
  // non-BMP
  '😀 grade',
  'grade 😀 one',
];

describe('Arabic search normalizer (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(CORPUS.map((input) => [JSON.stringify(input), input] as const))(
    'SQL arabic_normalize matches JS normalizeArabic for %s',
    async (_label, input) => {
      const [row] = await prisma.$queryRaw<Array<{ out: string }>>`
        SELECT arabic_normalize(${input}) AS out
      `;
      expect(row.out).toBe(normalizeArabic(input));
    },
  );

  it('treats NULL as the empty string', async () => {
    const [row] = await prisma.$queryRaw<Array<{ out: string }>>`
      SELECT arabic_normalize(NULL) AS out
    `;
    expect(row.out).toBe('');
  });

  it('actually folds presentation forms rather than passing them through', async () => {
    // Guards against the whole suite passing because both sides are no-ops.
    const [row] = await prisma.$queryRaw<Array<{ out: string }>>`
      SELECT arabic_normalize('ﻣﺪﺭﺳﺔ') AS out
    `;
    expect(row.out).toBe('مدرسة');
  });

  it('installs pg_trgm for the catalog fuzzy-search queries', async () => {
    const [row] = await prisma.$queryRaw<Array<{ score: number }>>`
      SELECT similarity('اسلاميات', 'اسلامية') AS score
    `;
    expect(row.score).toBeGreaterThan(0);
  });

  it('creates every expression index the search helpers rely on', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE indexname LIKE '%_search_%_idx'
    `;
    const names = rows.map((row) => row.indexname);
    for (const expected of [
      'Subject_search_trgm_idx',
      'Course_search_trgm_idx',
      'Chapter_search_trgm_idx',
      'Lesson_search_trgm_idx',
      'Section_search_trgm_idx',
      'ContentItem_search_trgm_idx',
      'Question_search_trgm_idx',
      'AcademicGrade_search_trgm_idx',
      'Governorate_search_trgm_idx',
      'Center_search_trgm_idx',
      'StudentProfile_search_trgm_idx',
      'PartnerProfile_search_trgm_idx',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('can use the trigram index for an alias-qualified search predicate', async () => {
    // The helpers qualify the target table as `t`; the expression indexes are
    // built on unqualified columns. This asserts the planner still matches them.
    // The table is empty here, so a sequential scan is genuinely cheapest;
    // disabling it (on the same connection, via a transaction) forces the
    // planner to reveal whether the index is a candidate at all.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
        EXPLAIN (COSTS OFF)
        SELECT t.id FROM "Chapter" t
        WHERE arabic_normalize(coalesce(t.title, '') || ' ' || coalesce(t.slug, '') || ' ' || coalesce(t.description, ''))
          LIKE '%اسلاميات%' ESCAPE E'\\\\'
      `;
    });
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toContain('Chapter_search_trgm_idx');
  });
});
