import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { ContentStatus } from '../src/common/types/roles.enum';

const PUBLISHED = ContentStatus.PUBLISHED;

/**
 * Seeds through Prisma rather than the admin HTTP API so these assertions stay
 * about search behaviour only, and do not fail for unrelated reasons when a
 * create DTO changes shape.
 */
describe('Catalog search (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let courseA: string;
  let courseB: string;

  const get = (url: string) => app.inject({ method: 'GET', url });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await cleanDatabase(app);

    ownerId = (
      await seedSuperAdmin(
        app,
        'catalog-search@example.com',
        'SuperAdminP@ss1!',
      )
    ).id;
    const audit = { createdById: ownerId, updatedById: ownerId };

    const grade = await prisma.academicGrade.create({
      data: {
        titleAr: 'الصف الأول',
        titleEn: 'Grade One',
        slug: 'grade-one',
        sortOrder: 1,
        status: PUBLISHED,
        publishedAt: new Date(),
        ...audit,
      },
    });
    const subject = await prisma.subject.create({
      data: {
        academicGradeId: grade.id,
        title: 'إسلاميات',
        slug: 'islamic',
        sortOrder: 1,
        status: PUBLISHED,
        publishedAt: new Date(),
        ...audit,
      },
    });

    const makeCourse = async (slug: string, sortOrder: number) =>
      (
        await prisma.course.create({
          data: {
            subjectId: subject.id,
            title: `مقرر ${slug}`,
            slug,
            sortOrder,
            status: PUBLISHED,
            publishedAt: new Date(),
            ...audit,
          },
        })
      ).id;
    courseA = await makeCourse('course-a', 1);
    courseB = await makeCourse('course-b', 2);

    // Both courses get chapters sharing the token "الفصل". A search scoped to
    // course A must not see course B's chapters.
    for (const [courseId, prefix, count] of [
      [courseA, 'a', 6],
      [courseB, 'b', 5],
    ] as const) {
      for (let i = 1; i <= count; i++) {
        await prisma.chapter.create({
          data: {
            courseId,
            title: `الفصل ${prefix}-${i}`,
            slug: `${prefix}-chapter-${i}`,
            sortOrder: i,
            status: PUBLISHED,
            publishedAt: new Date(),
            ...audit,
          },
        });
      }
    }

    // One chapter whose title carries diacritics, to prove normalization.
    await prisma.chapter.create({
      data: {
        courseId: courseA,
        title: 'مُعَلَّم',
        slug: 'a-chapter-diacritics',
        sortOrder: 7,
        status: PUBLISHED,
        publishedAt: new Date(),
        ...audit,
      },
    });

    const governorates = Array.from({ length: 27 }, (_, i) => ({
      nameAr: `محافظة ${i + 1}`,
      nameEn: `Governorate ${i + 1}`,
    }));
    await prisma.governorate.createMany({ data: governorates });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('search scope', () => {
    it('confines a chapter search to the requested course', async () => {
      const response = await get(
        `/api/v1/catalog/courses/${courseA}/chapters?q=${encodeURIComponent('الفصل')}&limit=100`,
      );
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(6);
      for (const chapter of body.data)
        expect(chapter.slug).toMatch(/^a-chapter-/);
    });

    it('does not leak the other course even for a single-character query', async () => {
      // "%a%" is the cheapest possible needle and previously resolved every
      // chapter id in the database before Prisma narrowed it by course.
      const response = await get(
        `/api/v1/catalog/courses/${courseB}/chapters?q=a&limit=100`,
      );
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      for (const chapter of body.data)
        expect(chapter.slug).toMatch(/^b-chapter-/);
    });
  });

  describe('Arabic normalization', () => {
    it('matches a diacritic-free query against a diacritic-bearing title', async () => {
      const response = await get(
        `/api/v1/catalog/courses/${courseA}/chapters?q=${encodeURIComponent('معلم')}&limit=100`,
      );
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.map((c: { slug: string }) => c.slug)).toEqual([
        'a-chapter-diacritics',
      ]);
    });

    it('rejects a query that normalizes to nothing', async () => {
      const response = await get(
        `/api/v1/catalog/courses/${courseA}/chapters?q=${encodeURIComponent('!!!')}`,
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe('paging', () => {
    it('returns disjoint cursor pages whose union is the full result set', async () => {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const url = `/api/v1/catalog/courses/${courseA}/chapters?q=${encodeURIComponent('الفصل')}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const body = JSON.parse((await get(url)).body);
        seen.push(...body.data.map((c: { id: string }) => c.id));
        if (!body.pageInfo.hasNextPage) break;
        cursor = body.pageInfo.nextCursor;
      }
      expect(new Set(seen).size).toBe(6);
    });

    it('paginates an offset search without duplicating or dropping rows', async () => {
      const page = async (n: number) =>
        JSON.parse(
          (
            await get(
              `/api/v1/catalog/subjects?q=${encodeURIComponent('اسلاميات')}&page=${n}&limit=1`,
            )
          ).body,
        );
      const first = await page(1);
      expect(first.meta.total).toBe(1);
      expect(first.data).toHaveLength(1);
    });
  });

  describe('governorates', () => {
    it('returns every governorate in one page by default', async () => {
      const response = await get('/api/v1/geography/governorates');
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(27);
      expect(body.meta.total).toBe(27);
    });

    it('still supports an explicit smaller page', async () => {
      const body = JSON.parse(
        (await get('/api/v1/geography/governorates?limit=5')).body,
      );
      expect(body.data).toHaveLength(5);
      expect(body.meta.total).toBe(27);
    });

    it('rejects a limit above the ceiling', async () => {
      expect(
        (await get('/api/v1/geography/governorates?limit=500')).statusCode,
      ).toBe(400);
    });
  });
});
