/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- e2e tests parse raw JSON bodies and stub provider internals */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Readable } from 'node:stream';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
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
  let uploadSpy: jest.SpyInstance;
  let deleteSpy: jest.SpyInstance;

  let adminToken: string;
  let partnerToken: string;
  // entitled: course-wide grant. chapterOnly: single-chapter grant. outsider: no grant.
  const students: Record<
    'entitled' | 'chapterOnly' | 'outsider',
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
  let pdfItemId: string;
  let pdfAssetId: string;
  let catalogGradeId: string;
  let catalogSubjectId: string;

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
          governorate: 'Cairo',
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

    // Never touch real Bunny Storage; protected-URL signing stays real so the
    // expiry assertions below exercise the production token format.
    uploadSpy = jest
      .spyOn(BunnyStorageProvider.prototype, 'upload')
      .mockImplementation((_key, body: Readable) => {
        body.resume();
        return Promise.resolve();
      });
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

    const registrationGradeId = (
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
      await post('/api/v1/admin/academic-grades', { title: 'Delivery Grade' }),
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
        await post('/api/v1/admin/chapters', { title, courseId: paidCourseId }),
      ).id;
      await publish('chapters', id);
      return id as string;
    };
    chapterAId = await createChapter('Paid Chapter A');
    const chapterBId = await createChapter('Paid Chapter B');
    paidChapterAItemId = await createPublishedItem('Chapter A item', {
      chapterId: chapterAId,
    });
    paidChapterBItemId = await createPublishedItem('Chapter B item', {
      chapterId: chapterBId,
    });

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
    pdfAssetId = json(
      await app.inject({
        method: 'POST',
        url: '/api/v1/admin/assets/upload?kind=PDF',
        headers: { ...admin(), 'content-type': pdf.contentType },
        payload: pdf.body,
      }),
    ).id;
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
    uploadSpy.mockRestore();
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

    it('returns published metadata only and personalizes locks for a student', async () => {
      const anonymous = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/outline`,
      });
      expect(anonymous.statusCode).toBe(200);
      const anonymousBody = json(anonymous);
      expect(anonymousBody.chapters).toHaveLength(2);
      expect(anonymousBody.chapters[0].isLocked).toBe(true);
      const item = anonymousBody.chapters[0].contentItems[0];
      expect(item).toMatchObject({ id: paidChapterAItemId, isLocked: true });
      expect(item.textBody).toBeUndefined();
      expect(item.externalUrl).toBeUndefined();
      expect(anonymous.body).not.toContain('storageKey');

      const entitled = await app.inject({
        method: 'GET',
        url: `/api/v1/catalog/courses/${paidCourseId}/outline`,
        headers: bearer(students.entitled.token),
      });
      expect(entitled.statusCode).toBe(200);
      expect(json(entitled).chapters[0].isLocked).toBe(false);
    });

    it('uses a safe delivery DTO instead of raw Prisma ancestry', async () => {
      const response = await readAsStudent('entitled', paidChapterAItemId);
      expect(response.statusCode).toBe(200);
      const body = json(response);
      expect(body).toMatchObject({ id: paidChapterAItemId, title: 'Chapter A item' });
      expect(body.status).toBeUndefined();
      expect(body.createdById).toBeUndefined();
      expect(body.placement.chapterId).toBe(chapterAId);
      expect(body.placement.chapter).toBeUndefined();
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
        chapterId: chapterAId,
        startsAt: new Date(Date.now() + DAY).toISOString(),
      });
      expect(
        (await readAsStudent('outsider', paidChapterAItemId)).statusCode,
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
          courseId: paidCourseId,
        }),
      );
      expect(
        (await readAsStudent('outsider', paidCourseItemId)).statusCode,
      ).toBe(200);

      // Revoking one of two overlapping grants leaves access intact.
      expect(
        (await post(`/api/v1/admin/entitlements/${first.id}/revoke`))
          .statusCode,
      ).toBe(201);
      expect(
        (await readAsStudent('outsider', paidCourseItemId)).statusCode,
      ).toBe(200);

      expect(
        (await post(`/api/v1/admin/entitlements/${second.id}/revoke`))
          .statusCode,
      ).toBe(201);
      expect(
        (await readAsStudent('outsider', paidCourseItemId)).statusCode,
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
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        studentUserId: students.entitled.id,
        courseId: paidCourseId,
        status: 'ACTIVE',
      });
    });
  });
});
