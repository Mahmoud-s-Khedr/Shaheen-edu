import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/database/prisma.service';
import {
  AssetKind,
  AssetProvider,
  ContentStatus,
  QuestionImportInputType,
  QuestionImportStatus,
  Role,
} from '../src/common/types/roles.enum';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';

describe('AI question import list filters (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let headers: { authorization: string };
  let adminId: string;
  let otherAdminId: string;
  const ids: Record<string, string> = {};
  const base = '/api/v1/admin/ai/question-imports';
  const date = '2026-10-10T00:00:00Z';

  async function list(query: Record<string, string> = {}) {
    const response = await app.inject({
      method: 'GET',
      url: `${base}?${new URLSearchParams(query)}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    return JSON.parse(response.body) as {
      data: Array<{ id: string }>;
      meta: { total: number; totalPages: number };
    };
  }
  async function expectIds(query: Record<string, string>, expected: string[]) {
    const response = await list(query);
    expect(response.data.map((row) => row.id).sort()).toEqual(
      [...expected].sort(),
    );
    expect(response.meta.total).toBe(expected.length);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await flushTestRedis(app);
    await cleanDatabase(app);
    const admin = await seedSuperAdmin(
      app,
      'import-filters@example.com',
      'SuperAdminP@ss1!',
    );
    adminId = admin.id;
    otherAdminId = (
      await seedSuperAdmin(
        app,
        'other-import-admin@example.com',
        'SuperAdminP@ss1!',
      )
    ).id;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email: admin.loginIdentifier, password: 'SuperAdminP@ss1!' },
    });
    expect(login.statusCode).toBe(201);
    const auth = JSON.parse(login.body) as { accessToken: string };
    headers = { authorization: `Bearer ${auth.accessToken}` };
    const owner = { createdById: adminId, updatedById: adminId };
    const subject = await prisma.subject.create({
      data: {
        ...owner,
        title: 'Subject',
        slug: 'import-filter-subject',
        sortOrder: 1,
      },
    });
    for (const n of [1, 2]) {
      const course = await prisma.course.create({
        data: {
          ...owner,
          subjectId: subject.id,
          title: 'Course',
          slug: `import-course-${n}`,
          sortOrder: n,
        },
      });
      const chapter = await prisma.chapter.create({
        data: {
          ...owner,
          courseId: course.id,
          title: 'Chapter',
          slug: `import-chapter-${n}`,
          sortOrder: n,
        },
      });
      const lesson = await prisma.lesson.create({
        data: {
          ...owner,
          chapterId: chapter.id,
          title: 'Lesson',
          slug: `import-lesson-${n}`,
          sortOrder: n,
        },
      });
      const section = await prisma.section.create({
        data: {
          ...owner,
          lessonId: lesson.id,
          title: 'Section',
          slug: `import-section-${n}`,
          sortOrder: n,
        },
      });
      Object.assign(ids, {
        [`course${n}`]: course.id,
        [`chapter${n}`]: chapter.id,
        [`lesson${n}`]: lesson.id,
        [`section${n}`]: section.id,
      });
    }
    const sibling = await prisma.chapter.create({
      data: {
        ...owner,
        courseId: ids.course1,
        title: 'Sibling',
        slug: 'import-sibling',
        sortOrder: 2,
      },
    });
    ids.sibling = sibling.id;
    const asset = await prisma.asset.create({
      data: {
        provider: AssetProvider.BUNNY_STORAGE,
        kind: AssetKind.PDF,
        filename: 'Biology الملف.pdf',
        originalFilename: 'source.pdf',
        mimeType: 'application/pdf',
        uploadedById: adminId,
      },
    });
    const defaults = {
      createdById: adminId,
      inputType: QuestionImportInputType.RAW_TEXT,
      bankId: 'bank-1',
      sourceId: 'source-1',
      courseId: ids.course1,
      model: 'test-model',
      schemaVersion: 'question-import-v7',
      createdAt: new Date(date),
      status: QuestionImportStatus.AWAITING_REVIEW,
    };
    for (const target of ['course', 'chapter', 'lesson', 'section']) {
      await prisma.questionImportBatch.create({
        data: {
          ...defaults,
          id: `import-${target}`,
          placements: [{ [`${target}Id`]: ids[`${target}1`] }],
          rawText: target === 'lesson' ? 'الخلية Biology 100%_done' : null,
          normalizedText: target === 'section' ? 'NormalizedMarker' : null,
        },
      });
    }
    await prisma.questionImportBatch.create({
      data: {
        ...defaults,
        id: 'import-multi',
        placements: [{ chapterId: ids.sibling }, { lessonId: ids.lesson1 }],
        status: QuestionImportStatus.FAILED,
      },
    });
    await prisma.questionImportBatch.create({
      data: {
        ...defaults,
        id: 'import-asset',
        placements: [{ sectionId: ids.section2 }],
        courseId: ids.course2,
        bankId: 'bank-2',
        sourceId: 'source-2',
        createdById: otherAdminId,
        inputType: QuestionImportInputType.ASSET,
        sourceAssetId: asset.id,
        status: QuestionImportStatus.COMPLETED_WITH_ERRORS,
        createdAt: new Date('2026-10-11T00:00:00Z'),
      },
    });
    await prisma.questionImportBatch.create({
      data: {
        ...defaults,
        id: 'import-invalid',
        placements: [],
        invalidItems: 1,
        status: QuestionImportStatus.COMPLETED,
      },
    });
    await prisma.questionImportBatch.create({
      data: {
        ...defaults,
        id: 'import-failed-items',
        placements: [],
        failedItems: 1,
        status: QuestionImportStatus.TRANSCRIBING,
      },
    });
    await prisma.questionImportBatch.create({
      data: {
        ...defaults,
        id: 'import-child',
        parentId: 'import-course',
        placements: [{ sectionId: ids.section1 }],
        status: QuestionImportStatus.FAILED,
      },
    });
  });

  afterAll(async () => {
    if (prisma) await prisma.questionImportBatch.deleteMany();
    await app?.close();
  });

  it('matches course and descendant placements without returning children', async () => {
    await expectIds({ chapterId: ids.chapter1 }, [
      'import-chapter',
      'import-lesson',
      'import-section',
      'import-multi',
    ]);
    await expectIds({ lessonId: ids.lesson1 }, [
      'import-lesson',
      'import-section',
      'import-multi',
    ]);
    await expectIds({ sectionId: ids.section1 }, ['import-section']);
    await expectIds({ courseId: ids.course2 }, ['import-asset']);
    await expectIds(
      {
        courseId: ids.course1,
        chapterId: ids.chapter1,
        lessonId: ids.lesson1,
        sectionId: ids.section1,
      },
      ['import-section'],
    );
  });

  it('requires one placement to match all hierarchy conditions', async () => {
    await expectIds({ chapterId: ids.sibling, lessonId: ids.lesson1 }, []);
    await expectIds({ courseId: ids.course2, sectionId: ids.section1 }, []);
    await expectIds({ sectionId: 'unknown' }, []);
    await expectIds({ chapterId: 'unknown' }, []);
  });

  it('keeps historical archived hierarchy placements searchable', async () => {
    await prisma.lesson.update({
      where: { id: ids.lesson1 },
      data: { status: ContentStatus.ARCHIVED },
    });
    await expectIds({ chapterId: ids.chapter1, lessonId: ids.lesson1 }, [
      'import-lesson',
      'import-section',
      'import-multi',
    ]);
  });

  it('combines core admin filters with placement and search', async () => {
    await expectIds(
      {
        bankId: 'bank-2',
        sourceId: 'source-2',
        createdById: otherAdminId,
        inputType: 'ASSET',
        courseId: ids.course2,
        q: 'BIOLOGY',
        status: 'COMPLETED_WITH_ERRORS',
      },
      ['import-asset'],
    );
    await expectIds(
      { inputType: 'RAW_TEXT', q: 'biology', chapterId: ids.chapter1 },
      ['import-lesson'],
    );
    await expectIds({ createdById: adminId, q: 'الخلية' }, ['import-lesson']);
    await expectIds({ q: 'الملف' }, ['import-asset']);
    await expectIds({ q: 'normalizedmarker' }, ['import-section']);
    await expectIds({ q: 'IMPORT-CHAPTER' }, ['import-chapter']);
    await expectIds({ q: '%_done' }, ['import-lesson']);
    await expectIds({ q: 'no-match' }, []);
    await expectIds({ q: "' OR TRUE --" }, []);
  });

  it('supports single and multiple statuses, including transcription', async () => {
    await expectIds({ status: 'FAILED' }, ['import-multi']);
    await expectIds({ statuses: 'FAILED,TRANSCRIBING,FAILED' }, [
      'import-multi',
      'import-failed-items',
    ]);
  });

  it('defines errors using statuses and both failure counters', async () => {
    await expectIds({ hasErrors: 'true' }, [
      'import-asset',
      'import-multi',
      'import-invalid',
      'import-failed-items',
    ]);
    await expectIds({ hasErrors: 'false' }, [
      'import-course',
      'import-chapter',
      'import-lesson',
      'import-section',
    ]);
    await expectIds({ hasErrors: 'false', status: 'FAILED' }, []);
  });

  it('uses inclusive from and exclusive to, honoring timezone offsets', async () => {
    await expectIds({ createdFrom: '2026-10-11T02:00:00+02:00' }, [
      'import-asset',
    ]);
    await expectIds(
      {
        createdFrom: date,
        createdTo: '2026-10-11T00:00:00Z',
        q: 'import-asset',
      },
      [],
    );
    await expectIds(
      {
        createdFrom: date,
        createdTo: '2026-10-10T00:00:01Z',
        sectionId: ids.section1,
      },
      ['import-section'],
    );
  });

  it('paginates filtered results with stable ordering and accurate totals', async () => {
    const first = await list({ hasErrors: 'false', limit: '2' });
    const second = await list({ hasErrors: 'false', limit: '2', page: '2' });
    expect(first.data.map((row) => row.id)).toEqual([
      'import-chapter',
      'import-course',
    ]);
    expect(second.data.map((row) => row.id)).toEqual([
      'import-lesson',
      'import-section',
    ]);
    expect(first.meta).toMatchObject({ total: 4, totalPages: 2 });
    expect(second.meta).toMatchObject({ total: 4, totalPages: 2 });
    const beyond = await list({ hasErrors: 'false', limit: '2', page: '3' });
    expect(beyond.data).toEqual([]);
    expect(beyond.meta.total).toBe(4);
    expect((await list()).data[0].id).toBe('import-asset');
  });

  it.each([
    { status: 'FAILED', statuses: 'FAILED' },
    { statuses: 'BAD' },
    { statuses: '' },
    { inputType: 'PDF' },
    { hasErrors: 'yes' },
    { hasErrors: '1' },
    { chapterId: ' ' },
    { createdFrom: '2026-10-01' },
    { createdTo: '2026-02-30T00:00:00Z' },
    ...['createdFrom', 'createdTo'].flatMap((field) =>
      ['2026-W42-1T00:00:00Z', '2026-292T00:00:00Z', '20261019T00:00:00Z'].map(
        (value) => ({ [field]: value }),
      ),
    ),
    { createdFrom: date, createdTo: date },
    { createdFrom: '2026-10-12T00:00:00Z', createdTo: date },
  ])('returns 400 for invalid query %j', async (query) => {
    const response = await app.inject({
      method: 'GET',
      url: `${base}?${new URLSearchParams(query)}`,
      headers,
    });
    expect(response.statusCode).toBe(400);
  });

  it('does not expose collection filters on the candidate-list endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${base}/import-course/items?bankId=bank-1`,
      headers,
    });
    expect(response.statusCode).toBe(400);
    const original = await app.inject({
      method: 'GET',
      url: `${base}/import-course/items?page=1&limit=20`,
      headers,
    });
    expect(original.statusCode).toBe(200);
  });

  it('allows admins and rejects missing credentials and non-admin roles', async () => {
    expect((await app.inject({ method: 'GET', url: base })).statusCode).toBe(
      401,
    );
    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.ADMIN },
    });
    expect(
      (await app.inject({ method: 'GET', url: base, headers })).statusCode,
    ).toBe(200);
    await prisma.user.update({
      where: { id: adminId },
      data: { role: Role.PARTNER },
    });
    try {
      expect(
        (await app.inject({ method: 'GET', url: base, headers })).statusCode,
      ).toBe(403);
    } finally {
      await prisma.user.update({
        where: { id: adminId },
        data: { role: Role.SUPER_ADMIN },
      });
    }
  });
});
