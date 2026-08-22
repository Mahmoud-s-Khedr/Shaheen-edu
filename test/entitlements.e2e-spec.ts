/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- e2e tests parse raw JSON bodies and stub provider internals */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { BunnyStorageProvider } from '../src/modules/assets/bunny-storage.provider';

const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const DAY = 24 * 60 * 60 * 1000;

function multipart(fileBuffer: Buffer, filename: string, mimetype: string) {
  const boundary = `----eduEntitlementBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mimetype}\r\n\r\n`,
  );
  return {
    body: Buffer.concat([
      head,
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Covers the Phase 7 delivery boundary: which caller may read which published
 * content, and which may exchange it for a protected asset URL.
 */
describe('Entitlements and student delivery (e2e)', () => {
  let app: NestFastifyApplication;
  let uploadUrlSpy: jest.SpyInstance;
  let inspectSpy: jest.SpyInstance;
  let deleteSpy: jest.SpyInstance;

  let adminToken: string;
  let partnerToken: string;
  // entitled: course-wide grant. chapterOnly: single-chapter grant. outsider: no grant.
  const students: Record<
    'entitled' | 'chapterOnly' | 'outsider' | 'searcher',
    { id: string; token: string }
  > = {} as never;

  let publicItemId: string;
  let freeItemId: string;
  let paidCourseItemId: string;
  let paidChapterAItemId: string;
  let paidChapterBItemId: string;
  let paidDraftItemId: string;
  let paidCourseId: string;
  let chapterAId: string;
  let chapterBId: string;
  let lessonAId: string;
  let sectionAId: string;
  let pdfItemId: string;
  let pdfAssetId: string;
  let catalogGradeId: string;
  let registrationGradeId: string;
  let catalogSubjectId: string;
  let governorateId: string;

  const json = (response: { body: string }) => JSON.parse(response.body);
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const admin = () => bearer(adminToken);

  const post = (url: string, payload?: unknown, headers = admin()) =>
    app.inject({ method: 'POST', url, headers, payload: payload ?? {} });

  const publish = (resource: string, id: string) =>
    post(`/api/v1/admin/${resource}/${id}/publish`);

  const createStudent = async (
    key: keyof typeof students,
    gradeId: string,
    nationalId: string,
    phone: string,
  ) => {
    const body = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: `Entitlement ${key}`,
          nationalId,
          phone,
          parentPhone: '01088880000',
          governorateId,
          password: 'StudentP@ss1!',
          academicGradeId: gradeId,
        },
      }),
    );
    students[key] = { id: body.user.id, token: body.accessToken };
  };

  /** Creates a published TEXT content item at the given placement. */
  const createPublishedItem = async (
    title: string,
    placement: Record<string, string>,
  ) => {
    const id = json(
      await post('/api/v1/admin/content-items', {
        type: 'TEXT',
        title,
        textBody: `${title} body`,
        placement,
      }),
    ).id;
    const published = await publish('content-items', id);
    expect(published.statusCode).toBe(201);
    return id as string;
  };

  const readAsStudent = (key: keyof typeof students, itemId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/student/content-items/${itemId}`,
      headers: bearer(students[key].token),
    });

  const readAnonymously = (itemId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/catalog/content-items/${itemId}`,
    });

  const grant = (payload: Record<string, unknown>) =>
    post('/api/v1/admin/entitlements', payload);

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    governorateId = (await seedGovernorate(app, 'Cairo')).id;

    // Never touch real Bunny Storage; protected-URL signing stays real so the
    // expiry assertions below exercise the production token format.
    uploadUrlSpy = jest
      .spyOn(BunnyStorageProvider.prototype, 'createUploadUrl')
      .mockResolvedValue('https://bunny.example.test/presigned');
    inspectSpy = jest.spyOn(BunnyStorageProvider.prototype, 'inspect');
    deleteSpy = jest
      .spyOn(BunnyStorageProvider.prototype, 'delete')
      .mockResolvedValue(undefined);

    await seedSuperAdmin(
      app,
      'entitlements-sa@example.com',
      'SuperAdminP@ss1!',
    );
    adminToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/admins/login',
        payload: {
          email: 'entitlements-sa@example.com',
          password: 'SuperAdminP@ss1!',
        },
      }),
    ).accessToken;

    await post('/api/v1/admin/partners', {
      email: 'entitlements-partner@example.com',
      password: 'PartnerP@ss1!',
      partnerType: 'CONTENT_PUBLISHER',
      displayName: 'Entitlements Partner',
    });
    partnerToken = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/partners/login',
        payload: {
          email: 'entitlements-partner@example.com',
          password: 'PartnerP@ss1!',
        },
      }),
    ).accessToken;

    registrationGradeId = (
      await seedPublishedAcademicGrade(app, 'entitlements-grade')
    ).id;
    await createStudent(
      'entitled',
      registrationGradeId,
      '29903030312345',
      '01099990001',
    );
    await createStudent(
      'chapterOnly',
      registrationGradeId,
      '29903030322345',
      '01099990002',
    );
    await createStudent(
      'outsider',
      registrationGradeId,
      '29903030332345',
      '01099990003',
    );

    // Published grade -> subject shared by all three courses.
    catalogGradeId = json(
      await post('/api/v1/admin/academic-grades', {
        title: { ar: 'Delivery Grade', en: 'Delivery Grade' },
      }),
    ).id;
    await publish('academic-grades', catalogGradeId);
    catalogSubjectId = json(
      await post('/api/v1/admin/subjects', {
        title: 'Delivery Subject',
        academicGradeId: catalogGradeId,
      }),
    ).id;
    await publish('subjects', catalogSubjectId);

    const createCourse = async (title: string, accessType: string) => {
      const id = json(
        await post('/api/v1/admin/courses', {
          title,
          subjectId: catalogSubjectId,
          accessType,
        }),
      ).id;
      await publish('courses', id);
      return id as string;
    };
    const publicCourseId = await createCourse('Public Course', 'PUBLIC');
    const freeCourseId = await createCourse('Free Course', 'FREE');
    paidCourseId = await createCourse('Paid Course', 'PAID');

    publicItemId = await createPublishedItem('Public item', {
      courseId: publicCourseId,
    });
    freeItemId = await createPublishedItem('Free item', {
      courseId: freeCourseId,
    });
    paidCourseItemId = await createPublishedItem('Paid course item', {
      courseId: paidCourseId,
    });

    const createChapter = async (title: string) => {
      const id = json(
        await post('/api/v1/admin/chapters', {
          title,
          courseId: paidCourseId,
        }),
      ).id;
      await publish('chapters', id);
      return id as string;
    };
    chapterAId = await createChapter('Paid Chapter A');
    chapterBId = await createChapter('Paid Chapter B');
    await createChapter('إسلاميات 100%_');
    paidChapterAItemId = await createPublishedItem('Chapter A item', {
      chapterId: chapterAId,
    });
    paidChapterBItemId = await createPublishedItem('Chapter B item', {
      chapterId: chapterBId,
    });

    const createLesson = async (title: string) => {
      const id = json(
        await post('/api/v1/admin/lessons', {
          title,
          chapterId: chapterAId,
        }),
      ).id;
      await publish('lessons', id);
      return id as string;
    };
    lessonAId = await createLesson('Paid Lesson A');
    const lessonBId = await createLesson('Paid Lesson B');
    const createSection = async (title: string) => {
      const id = json(
        await post('/api/v1/admin/sections', {
          title,
          lessonId: lessonAId,
        }),
      ).id;
      await publish('sections', id);
      return id as string;
    };
    sectionAId = await createSection('Paid Section A');
    await createSection('Paid Section B');
    await createPublishedItem('Lesson A item', { lessonId: lessonAId });
    await createPublishedItem('Lesson B item', { lessonId: lessonBId });
    await createPublishedItem('Section A item', { sectionId: sectionAId });

    // A draft item under fully published, entitled ancestry.
    paidDraftItemId = json(
      await post('/api/v1/admin/content-items', {
        type: 'TEXT',
        title: 'Unfinished item',
        textBody: 'Not ready',
        placement: { chapterId: chapterAId },
      }),
    ).id;

    // A PDF item in chapter A, for protected asset delivery.
    const pdf = multipart(PDF_BYTES, 'entitled.pdf', 'application/pdf');
    const authorization = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/assets/upload?kind=PDF',
      headers: { ...admin(), 'content-type': pdf.contentType },
      payload: pdf.body,
    });
    pdfAssetId = json(authorization).asset.id;
    inspectSpy.mockResolvedValueOnce({
      sizeBytes: PDF_BYTES.length,
      mimeType: 'application/pdf',
      first: PDF_BYTES.subarray(0, 16),
    });
    expect(
      (await post(`/api/v1/admin/assets/${pdfAssetId}/complete`)).statusCode,
    ).toBe(201);
    pdfItemId = json(
      await post('/api/v1/admin/content-items', {
        type: 'PDF',
        title: 'Paid PDF',
        placement: { chapterId: chapterAId },
      }),
    ).id;
    await post(`/api/v1/admin/content-items/${pdfItemId}/primary-asset`, {
      assetId: pdfAssetId,
    });
    expect((await publish('content-items', pdfItemId)).statusCode).toBe(201);

    await grant({
      studentUserId: students.entitled.id,
      courseId: paidCourseId,
    });
    await grant({
      studentUserId: students.chapterOnly.id,
      chapterId: chapterAId,
    });
  });

  afterAll(async () => {
    uploadUrlSpy.mockRestore();
    inspectSpy.mockRestore();
    deleteSpy.mockRestore();
    await app.close();
  });

  describe('effective access type', () => {
    it('serves PUBLIC content without authentication', async () => {
      expect((await readAnonymously(publicItemId)).statusCode).toBe(200);
      expect((await readAsStudent('outsider', publicItemId)).statusCode).toBe(
        200,
      );
    });

    it('requires an authenticated student for FREE content', async () => {
      expect((await readAnonymously(freeItemId)).statusCode).toBe(403);
      expect((await readAsStudent('outsider', freeItemId)).statusCode).toBe(
        200,
      );
    });

    it('requires an entitlement for PAID content', async () => {
      expect((await readAnonymously(paidCourseItemId)).statusCode).toBe(403);
      expect(
        (await readAsStudent('outsider', paidCourseItemId)).statusCode,
      ).toBe(403);
      expect(
        (await readAsStudent('entitled', paidCourseItemId)).statusCode,
      ).toBe(200);
    });

    it('inherits PAID from the course through chapter-level content', async () => {
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
      ).toBe(403);
      expect(
        (await readAsStudent('entitled', paidChapterAItemId)).statusCode,
      ).toBe(200);
    });
  });

  describe('published catalog outline', () => {
    it('paginates and filters published catalog collections', async () => {
      const defaultSubjects = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/subjects',
      });
      expect(defaultSubjects.statusCode).toBe(200);
      expect(json(defaultSubjects)).toMatchObject({
        data: [{ id: catalogSubjectId }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const subjects = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/subjects?academicGradeId=${catalogGradeId}`,
      });
      expect(subjects.statusCode).toBe(200);
      expect(json(subjects)).toMatchObject({
        data: [{ id: catalogSubjectId }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const courses = await app.inject({
        method: 'GET',
        url:
          `/api/v1/catalog/courses?subjectId=${catalogSubjectId}` +
          '&page=3&limit=1',
      });
      expect(courses.statusCode).toBe(200);
      expect(json(courses)).toMatchObject({
        data: [{ id: paidCourseId }],
        meta: { page: 3, limit: 1, total: 3, totalPages: 3 },
      });
    });

    it('rejects invalid catalog collection query parameters', async () => {
      const invalidPage = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/subjects?page=0',
      });
      expect(invalidPage.statusCode).toBe(400);

      const unexpectedParameter = await app.inject({
        method: 'GET',
        url: '/api/v1/catalog/courses?unexpected=value',
      });
      expect(unexpectedParameter.statusCode).toBe(400);
    });

    it('returns published metadata in bounded catalog child pages', async () => {
      const chapters = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?limit=1`,
      });
      expect(chapters.statusCode).toBe(200);
      expect(json(chapters).data).toHaveLength(1);
      expect(json(chapters).pageInfo.hasNextPage).toBe(true);
      const next = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?limit=1&cursor=${encodeURIComponent(json(chapters).pageInfo.nextCursor)}`,
      });
      expect(next.statusCode).toBe(200);
      expect(json(next).data).toHaveLength(1);
      expect(json(next).data[0].id).not.toBe(json(chapters).data[0].id);
      const searchedChapters = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?limit=1&q=Paid`,
      });
      expect(searchedChapters.statusCode).toBe(200);
      const searchedNext = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?limit=1&q=Paid&cursor=${encodeURIComponent(json(searchedChapters).pageInfo.nextCursor)}`,
      });
      expect(searchedNext.statusCode).toBe(200);
      expect(json(searchedNext).data).toEqual([
        expect.objectContaining({ title: 'Paid Chapter B' }),
      ]);
      const mismatchedSearchCursor = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?limit=1&q=Other&cursor=${encodeURIComponent(json(searchedChapters).pageInfo.nextCursor)}`,
      });
      expect(mismatchedSearchCursor.statusCode).toBe(400);
      const normalizedArabic = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?q=${encodeURIComponent('اسلام')}`,
      });
      expect(normalizedArabic.statusCode).toBe(200);
      expect(json(normalizedArabic).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'إسلاميات 100%_' }),
        ]),
      );
      const literalWildcard = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?q=${encodeURIComponent('%')}`,
      });
      expect(literalWildcard.statusCode).toBe(400);
      const anonymous = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/chapters/${chapterAId}/content-items?limit=1`,
      });
      expect(anonymous.statusCode).toBe(200);
      const item = json(anonymous).data[0];
      expect(item).toMatchObject({ id: paidChapterAItemId });
      expect(json(anonymous)).toMatchObject({
        pageInfo: { hasNextPage: true },
      });
      const nextContent = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/chapters/${chapterAId}/content-items?limit=1&cursor=${encodeURIComponent(json(anonymous).pageInfo.nextCursor)}`,
      });
      expect(nextContent.statusCode).toBe(200);
      expect(json(nextContent).data[0].id).not.toBe(item.id);
      expect(item.textBody).toBeUndefined();
      expect(item.externalUrl).toBeUndefined();
      expect(anonymous.body).not.toContain('storageKey');
    });

    it('lists published lessons and sections one hierarchy level at a time', async () => {
      const lessons = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/chapters/${chapterAId}/lessons`,
      });
      expect(lessons.statusCode).toBe(200);
      expect(json(lessons)).toMatchObject({
        parent: { id: chapterAId },
        data: expect.arrayContaining([
          expect.objectContaining({ id: lessonAId }),
        ]),
      });

      const sections = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/lessons/${lessonAId}/sections`,
      });
      expect(sections.statusCode).toBe(200);
      expect(json(sections)).toMatchObject({
        parent: { id: lessonAId },
        data: expect.arrayContaining([
          expect.objectContaining({ id: sectionAId }),
        ]),
      });
    });

    it('rejects malformed cursors and unsupported catalog resources', async () => {
      const invalidCursor = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/chapters?cursor=not-a-cursor`,
      });
      expect(invalidCursor.statusCode).toBe(400);
      const invalidResource = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/unknown/${paidCourseId}/content-items`,
      });
      expect(invalidResource.statusCode).toBe(400);
    });

    it('uses a safe delivery DTO instead of raw Prisma ancestry', async () => {
      const response = await readAsStudent('entitled', paidChapterAItemId);
      expect(response.statusCode).toBe(200);
      const body = json(response);
      expect(body).toMatchObject({
        id: paidChapterAItemId,
        title: 'Chapter A item',
      });
      expect(body.status).toBeUndefined();
      expect(body.createdById).toBeUndefined();
      expect(body.placement.chapterId).toBe(chapterAId);
      expect(body.placement.chapter).toBeUndefined();
    });
  });

  describe('student catalogue', () => {
    it('scopes discovery to the profile grade and resolves chapter access and inherited pricing', async () => {
      const registration = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: {
          fullName: 'Catalogue Student',
          nationalId: '29903030342345',
          phone: '01099990004',
          parentPhone: '01088880004',
          governorateId,
          password: 'StudentP@ss1!',
          academicGradeId: catalogGradeId,
        },
      });
      expect(registration.statusCode).toBe(201);
      const student = json(registration);
      const headers = bearer(student.accessToken);

      const otherGradeSubjectId = json(
        await post('/api/v1/admin/subjects', {
          title: 'Other grade subject',
          academicGradeId: registrationGradeId,
        }),
      ).id;
      expect((await publish('subjects', otherGradeSubjectId)).statusCode).toBe(
        201,
      );

      expect(
        (
          await post(`/api/v1/admin/pricing/course/${paidCourseId}`, {
            isPurchasable: true,
            priceMinor: 20_000,
            currency: 'EGP',
          })
        ).statusCode,
      ).toBe(201);

      const summary = await app.inject({
        method: 'GET',
        url: '/api/v1/student/catalog',
        headers,
      });
      expect(summary.statusCode).toBe(200);
      expect(json(summary)).toMatchObject({
        academicGrade: { id: catalogGradeId },
        summary: { subjects: 1, courses: 3, chapters: 3 },
      });

      const courses = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/subjects/${catalogSubjectId}/courses`,
        headers,
      });
      expect(courses.statusCode).toBe(200);
      const coursesBody = JSON.parse(courses.body) as {
        data: Array<{ id: string; access: unknown }>;
      };
      const paidCourse = coursesBody.data.find(
        (course: { id: string }) => course.id === paidCourseId,
      );
      expect(paidCourse).toMatchObject({
        access: {
          state: 'PURCHASABLE',
          price: { amountMinor: 20_000, currency: 'EGP' },
        },
        isLocked: true,
      });

      const otherGradeCourses = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/subjects/${otherGradeSubjectId}/courses`,
        headers,
      });
      expect(otherGradeCourses.statusCode).toBe(404);

      expect(
        (await grant({ studentUserId: student.user.id, chapterId: chapterAId }))
          .statusCode,
      ).toBe(201);
      const firstChapters = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/courses/${paidCourseId}/chapters?limit=1`,
        headers,
      });
      expect(firstChapters.statusCode).toBe(200);
      expect(json(firstChapters)).toMatchObject({
        parent: { id: paidCourseId, access: { state: 'PURCHASABLE' } },
        data: [
          { id: chapterAId, access: { state: 'ENTITLED' }, isLocked: false },
        ],
        pageInfo: { hasNextPage: true },
      });
      const secondChapters = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/courses/${paidCourseId}/chapters?limit=1&cursor=${encodeURIComponent(json(firstChapters).pageInfo.nextCursor)}`,
        headers,
      });
      expect(secondChapters.statusCode).toBe(200);
      expect(json(secondChapters).data[0].id).not.toBe(chapterAId);

      const lessons = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/chapters/${chapterAId}/lessons`,
        headers,
      });
      expect(lessons.statusCode).toBe(200);
      expect(json(lessons)).toMatchObject({
        parent: {
          id: chapterAId,
          access: { state: 'ENTITLED' },
          isLocked: false,
        },
        data: expect.arrayContaining([
          expect.objectContaining({
            id: lessonAId,
            access: expect.objectContaining({ state: 'ENTITLED' }),
            isLocked: false,
          }),
        ]),
      });
      const sections = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/lessons/${lessonAId}/sections`,
        headers,
      });
      expect(sections.statusCode).toBe(200);
      const sectionsBody = json(sections);
      expect(sectionsBody).toMatchObject({
        parent: {
          id: lessonAId,
          access: { state: 'ENTITLED' },
          isLocked: false,
        },
      });
      expect(sectionsBody.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: sectionAId,
            access: expect.objectContaining({ state: 'ENTITLED' }),
            isLocked: false,
          }),
        ]),
      );

      const chapter = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/chapters/${chapterAId}/content-items?limit=1`,
        headers,
      });
      expect(chapter.statusCode).toBe(200);
      expect(json(chapter)).toMatchObject({
        parent: {
          id: chapterAId,
          access: { state: 'ENTITLED' },
          isLocked: false,
        },
      });
      expect(json(chapter)).toMatchObject({ pageInfo: { hasNextPage: true } });
      expect(json(chapter).data[0]).toMatchObject({
        id: paidChapterAItemId,
        access: { state: 'ENTITLED' },
        isLocked: false,
      });
      const nextContent = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/chapters/${chapterAId}/content-items?limit=1&cursor=${encodeURIComponent(json(chapter).pageInfo.nextCursor)}`,
        headers,
      });
      expect(nextContent.statusCode).toBe(200);
      expect(json(nextContent).data[0].id).not.toBe(paidChapterAItemId);

      const invalidResource = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/unknown/${paidCourseId}/content-items`,
        headers,
      });
      expect(invalidResource.statusCode).toBe(400);

      const library = await app.inject({
        method: 'GET',
        url: '/api/v1/student/library',
        headers,
      });
      expect(library.statusCode).toBe(200);
      expect(json(library).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            targetType: 'CHAPTER',
            target: expect.objectContaining({ id: chapterAId }),
          }),
        ]),
      );

      const ownEntitlements = await app.inject({
        method: 'GET',
        url: '/api/v1/student/entitlements',
        headers,
      });
      expect(ownEntitlements.statusCode).toBe(200);
      expect(json(ownEntitlements)).toMatchObject({
        data: [
          expect.objectContaining({
            targetType: 'CHAPTER',
            targetId: chapterAId,
          }),
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
    });
  });

  describe('student learning state and subject discovery', () => {
    it('persists private study state, returns it from delivery, and resolves continue learning', async () => {
      const headers = bearer(students.entitled.token);
      const before = await readAsStudent('entitled', paidChapterAItemId);
      expect(json(before).studyState).toEqual({
        lastOpenedAt: null,
        playbackPositionSeconds: null,
      });

      const saved = await app.inject({
        method: 'PUT',
        url: `/api/v1/student/content-items/${paidChapterAItemId}/study-state`,
        headers,
        payload: { playbackPositionSeconds: 245 },
      });
      expect(saved.statusCode).toBe(200);
      expect(json(saved)).toMatchObject({
        contentItemId: paidChapterAItemId,
        studyState: { playbackPositionSeconds: 245 },
      });

      const delivery = await readAsStudent('entitled', paidChapterAItemId);
      expect(json(delivery).studyState).toMatchObject({
        playbackPositionSeconds: 245,
      });
      const continuation = await app.inject({
        method: 'GET',
        url: '/api/v1/student/learning/continue',
        headers,
      });
      expect(continuation.statusCode).toBe(200);
      expect(json(continuation)).toMatchObject({
        data: {
          contentItem: { id: paidChapterAItemId },
          studyState: { playbackPositionSeconds: 245 },
          subject: { id: catalogSubjectId },
          course: { id: paidCourseId },
          chapter: { id: chapterAId },
        },
      });

      const forbidden = await app.inject({
        method: 'PUT',
        url: `/api/v1/student/content-items/${paidChapterAItemId}/study-state`,
        headers: bearer(students.outsider.token),
        payload: { playbackPositionSeconds: 1 },
      });
      expect(forbidden.statusCode).toBe(403);
      const invalid = await app.inject({
        method: 'PUT',
        url: `/api/v1/student/content-items/${paidChapterAItemId}/study-state`,
        headers,
        payload: { playbackPositionSeconds: -1 },
      });
      expect(invalid.statusCode).toBe(400);
    });

    it('derives My Subjects from active grants and searches the current grade only', async () => {
      const owned = await app.inject({
        method: 'GET',
        url: '/api/v1/student/my-subjects',
        headers: bearer(students.entitled.token),
      });
      expect(owned.statusCode).toBe(200);
      expect(json(owned).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subject: expect.objectContaining({ id: catalogSubjectId }),
            subscription: expect.objectContaining({ state: 'ACTIVE' }),
            progress: expect.objectContaining({
              totalContentItems: expect.any(Number),
            }),
          }),
        ]),
      );

      await createStudent(
        'searcher',
        catalogGradeId,
        '29903030352345',
        '01099990005',
      );
      await grant({
        studentUserId: students.searcher.id,
        chapterId: chapterAId,
      });
      const search = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/search?subjectId=${catalogSubjectId}&q=Paid&types=CHAPTER,LESSON,SECTION`,
        headers: bearer(students.searcher.token),
      });
      expect(search.statusCode).toBe(200);
      expect(json(search).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CHAPTER',
            id: chapterAId,
            breadcrumb: expect.objectContaining({
              subject: expect.objectContaining({ id: catalogSubjectId }),
              lesson: null,
              section: null,
            }),
            access: expect.any(Object),
          }),
          expect.objectContaining({
            type: 'LESSON',
            id: lessonAId,
            breadcrumb: expect.objectContaining({
              subject: expect.objectContaining({ id: catalogSubjectId }),
              section: null,
            }),
          }),
          expect.objectContaining({
            type: 'SECTION',
            id: sectionAId,
            breadcrumb: expect.objectContaining({
              subject: expect.objectContaining({ id: catalogSubjectId }),
              lesson: expect.objectContaining({ id: lessonAId }),
              section: expect.objectContaining({ id: sectionAId }),
            }),
          }),
        ]),
      );
      const invalidType = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/search?subjectId=${catalogSubjectId}&q=Paid&types=COURSE`,
        headers: bearer(students.searcher.token),
      });
      expect(invalidType.statusCode).toBe(400);
      const punctuationOnlyQuery = await app.inject({
        method: 'GET',
        url: `/api/v1/student/catalog/search?subjectId=${catalogSubjectId}&q=${encodeURIComponent('!!!')}`,
        headers: bearer(students.searcher.token),
      });
      expect(punctuationOnlyQuery.statusCode).toBe(400);
    });
  });

  describe('grant boundaries', () => {
    it('confines a chapter grant to that chapter', async () => {
      expect(
        (await readAsStudent('chapterOnly', paidChapterAItemId)).statusCode,
      ).toBe(200);
      expect(
        (await readAsStudent('chapterOnly', paidChapterBItemId)).statusCode,
      ).toBe(403);
      // Course-level content is outside a chapter grant.
      expect(
        (await readAsStudent('chapterOnly', paidCourseItemId)).statusCode,
      ).toBe(403);
    });

    it('spans every chapter under a course grant', async () => {
      expect(
        (await readAsStudent('entitled', paidChapterBItemId)).statusCode,
      ).toBe(200);
    });

    it('hides draft content even from an entitled student', async () => {
      expect(
        (await readAsStudent('entitled', paidDraftItemId)).statusCode,
      ).toBe(403);
    });

    it('does not leak another student’s access (IDOR)', async () => {
      // The outsider knows every ID above and still receives nothing.
      for (const id of [paidCourseItemId, paidChapterAItemId, pdfItemId]) {
        expect((await readAsStudent('outsider', id)).statusCode).toBe(403);
      }
    });

    it('denies partners protected student delivery', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/student/content-items/${paidCourseItemId}`,
        headers: bearer(partnerToken),
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('grant lifecycle', () => {
    it('denies an expired grant', async () => {
      await grant({
        studentUserId: students.outsider.id,
        chapterId: chapterAId,
        startsAt: new Date(Date.now() - 2 * DAY).toISOString(),
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      });
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
      ).toBe(403);
    });

    it('denies a grant that has not started', async () => {
      await grant({
        studentUserId: students.outsider.id,
        chapterId: chapterBId,
        startsAt: new Date(Date.now() + DAY).toISOString(),
      });
      expect(
        (await readAsStudent('outsider', paidChapterBItemId)).statusCode,
      ).toBe(403);
    });

    it('unions overlapping grants and revokes them one at a time', async () => {
      const first = json(
        await grant({
          studentUserId: students.outsider.id,
          courseId: paidCourseId,
        }),
      );
      const second = json(
        await grant({
          studentUserId: students.outsider.id,
          chapterId: chapterAId,
        }),
      );
      expect(first).toMatchObject({
        id: expect.any(String),
        status: 'ACTIVE',
        courseId: paidCourseId,
      });
      expect(second).toMatchObject({
        id: expect.any(String),
        status: 'ACTIVE',
        chapterId: chapterAId,
      });
      expect(second.id).not.toBe(first.id);
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
      ).toBe(200);

      // Revoking one of two overlapping grants leaves access intact.
      expect(
        (await post(`/api/v1/admin/entitlements/${first.id}/revoke`))
          .statusCode,
      ).toBe(200);
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
      ).toBe(200);

      expect(
        (await post(`/api/v1/admin/entitlements/${second.id}/revoke`))
          .statusCode,
      ).toBe(200);
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
      ).toBe(403);
    });

    it('rejects invalid grants', async () => {
      const bothTargets = await grant({
        studentUserId: students.outsider.id,
        courseId: paidCourseId,
        chapterId: chapterAId,
      });
      expect(bothTargets.statusCode).toBe(400);

      const noTarget = await grant({ studentUserId: students.outsider.id });
      expect(noTarget.statusCode).toBe(400);

      const badWindow = await grant({
        studentUserId: students.outsider.id,
        courseId: paidCourseId,
        startsAt: new Date(Date.now() + DAY).toISOString(),
        expiresAt: new Date(Date.now() - DAY).toISOString(),
      });
      expect(badWindow.statusCode).toBe(400);

      const notAStudent = await grant({
        studentUserId: 'missing-user-id',
        courseId: paidCourseId,
      });
      expect(notAStudent.statusCode).toBe(404);
    });
  });

  describe('protected asset delivery', () => {
    const access = (headers: Record<string, string>, scope: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/${scope}/content-items/${pdfItemId}/assets/${pdfAssetId}/access`,
        headers,
      });

    it('issues a short-lived signed URL to an entitled student', async () => {
      const response = await access(bearer(students.entitled.token), 'student');
      expect(response.statusCode).toBe(200);
      const body = json(response);
      expect(body.url).toContain('token=');
      expect(body.url).toContain('expires=');
      const ttlMs = new Date(body.expiresAt).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000);
      // The signed CDN path is the delivery URL, but no credential, provider
      // internal, or unrestricted origin URL may accompany it.
      expect(body.storageKey).toBeUndefined();
      expect(response.body).not.toContain('test-storage-token-key');
      expect(response.body).not.toContain('test-secret');
      expect(response.body).not.toContain('storage.bunnycdn.com');
    });

    it('denies the same URL to a student without a grant and to the public route', async () => {
      expect(
        (await access(bearer(students.outsider.token), 'student')).statusCode,
      ).toBe(403);
      expect((await access({}, 'catalog')).statusCode).toBe(403);
    });

    it('refuses an asset that is not attached to the content item', async () => {
      const otherPdf = multipart(PDF_BYTES, 'other.pdf', 'application/pdf');
      const otherAssetId = json(
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/assets/upload?kind=PDF',
          headers: { ...admin(), 'content-type': otherPdf.contentType },
          payload: otherPdf.body,
        }),
      ).id;
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/student/content-items/${pdfItemId}/assets/${otherAssetId}/access`,
        headers: bearer(students.entitled.token),
      });
      expect(response.statusCode).toBe(403);
    });
  });

  describe('admin-only entitlement management', () => {
    const routes: { method: 'GET' | 'POST'; url: string }[] = [
      { method: 'GET', url: '/api/v1/admin/entitlements' },
      { method: 'POST', url: '/api/v1/admin/entitlements' },
      { method: 'POST', url: '/api/v1/admin/entitlements/any-id/revoke' },
    ];

    it('rejects students, partners, and anonymous callers', async () => {
      for (const route of routes) {
        const options =
          route.method === 'GET' ? route : { ...route, payload: {} };
        expect(
          (
            await app.inject({
              ...options,
              headers: bearer(students.entitled.token),
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (await app.inject({ ...options, headers: bearer(partnerToken) }))
            .statusCode,
        ).toBe(403);
        expect((await app.inject(options)).statusCode).toBe(401);
      }
    });

    it('lists a student’s grants for an admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/entitlements?studentUserId=${students.entitled.id}`,
        headers: admin(),
      });
      expect(response.statusCode).toBe(200);
      const body = json(response);
      expect(body).toMatchObject({
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        studentUserId: students.entitled.id,
        courseId: paidCourseId,
        status: 'ACTIVE',
      });
    });
  });
});
