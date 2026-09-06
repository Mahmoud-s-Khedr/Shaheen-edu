/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedSuperAdmin,
} from './utils/db';

describe('Academic hierarchy (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let studentToken: string;
  let partnerToken: string;
  let registrationGradeId: string;

  async function json(response: { body: string }) {
    return JSON.parse(response.body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);

    const superAdminEmail = 'sa-for-hierarchy-test@example.com';
    const superAdminPassword = 'SuperAdminP@ss1!';
    await seedSuperAdmin(app, superAdminEmail, superAdminPassword);

    const saLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email: superAdminEmail, password: superAdminPassword },
    });
    const saToken = (await json(saLogin)).accessToken;

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${saToken}` },
      payload: {
        email: 'hierarchy-admin@example.com',
        password: 'AdminP@ss1!',
      },
    });
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'hierarchy-admin@example.com',
        password: 'AdminP@ss1!',
      },
    });
    adminToken = (await json(adminLogin)).accessToken;

    const registrationGrade = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/academic-grades',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: { ar: 'Registration Grade', en: 'Registration Grade' },
      },
    });
    const registrationGradeBody = await json(registrationGrade);
    registrationGradeId = registrationGradeBody.id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/academic-grades/${registrationGradeBody.id}/publish`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { version: registrationGradeBody.version },
    });

    const studentRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        fullName: 'Hierarchy Student',
        nationalId: '29902020299999',
        phone: '01055559999',
        parentPhone: '01066668888',
        governorateId: (await seedGovernorate(app, 'Cairo')).id,
        academicGradeId: registrationGradeBody.id,
        password: 'StudentP@ss1!',
      },
    });
    studentToken = (await json(studentRegister)).accessToken;

    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/partners',
      headers: { authorization: `Bearer ${saToken}` },
      payload: {
        email: 'hierarchy-partner@example.com',
        password: 'PartnerP@ss1!',
        partnerType: 'CONTENT_PUBLISHER',
        displayName: 'Hierarchy Partner',
      },
    });
    const partnerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/partners/login',
      payload: {
        email: 'hierarchy-partner@example.com',
        password: 'PartnerP@ss1!',
      },
    });
    partnerToken = (await json(partnerLogin)).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function authHeader(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  describe('full hierarchy creation', () => {
    let gradeId: string;
    let subjectId: string;
    let courseId: string;
    let chapterId: string;
    let lessonId: string;
    let sectionId: string;

    it('creates a grade in DRAFT', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: { title: { ar: 'Grade 10', en: 'Grade 10' } },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.status).toBe('DRAFT');
      expect(body.slug).toBe('grade-10');
      gradeId = body.id;

      const publicGrades = await app.inject({
        method: 'GET',
        url: '/api/v1/academic-grades',
      });
      expect(publicGrades.statusCode).toBe(200);
      const publicBody = await json(publicGrades);
      expect(publicBody.meta).toMatchObject({ page: 1, limit: 20, total: 1 });
      expect(
        publicBody.data.map((grade: { id: string }) => grade.id),
      ).not.toContain(gradeId);
    });

    it('creates a subject under the grade', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: { title: 'Mathematics', academicGradeIds: [gradeId] },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.status).toBe('DRAFT');
      expect(body.academicGradeId).toBe(gradeId);
      expect(body.academicGradeIds).toEqual([gradeId]);
      subjectId = body.id;
    });

    it('creates a course under the subject', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/courses',
        headers: authHeader(adminToken),
        payload: {
          title: 'Algebra Fundamentals',
          subjectId,
          accessType: 'PUBLIC',
        },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.subjectId).toBe(subjectId);
      courseId = body.id;
    });

    it('reuses the subject in another grade while keeping that grade’s course separate', async () => {
      const grade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: {
          title: {
            ar: 'Shared Subject Secondary Grade',
            en: 'Shared Subject Secondary Grade',
          },
        },
      });
      expect(grade.statusCode).toBe(201);
      const secondGradeId = (await json(grade)).id;

      const subject = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/subjects/${subjectId}`,
        headers: authHeader(adminToken),
        payload: { academicGradeIds: [gradeId, secondGradeId] },
      });
      expect(subject.statusCode).toBe(200);
      expect((await json(subject)).academicGradeIds).toEqual(
        expect.arrayContaining([gradeId, secondGradeId]),
      );

      const course = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/courses',
        headers: authHeader(adminToken),
        payload: {
          title: 'Grade 11 Algebra',
          subjectId,
          academicGradeId: secondGradeId,
          accessType: 'PUBLIC',
        },
      });
      expect(course.statusCode).toBe(201);
      const secondGradeCourseId = (await json(course)).id;

      const otherSubject = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: { title: 'Grade 11 Geometry', academicGradeId: secondGradeId },
      });
      expect(otherSubject.statusCode).toBe(201);
      const otherSubjectId = (await json(otherSubject)).id;

      const reorderedSubjects = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects/reorder',
        headers: authHeader(adminToken),
        payload: {
          academicGradeId: secondGradeId,
          items: [
            { id: otherSubjectId, sortOrder: 1 },
            { id: subjectId, sortOrder: 2 },
          ],
        },
      });
      expect(reorderedSubjects.statusCode).toBe(201);
      const subjectsInSecondGrade = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${secondGradeId}`,
        headers: authHeader(adminToken),
      });
      expect((await json(subjectsInSecondGrade)).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: otherSubjectId, sortOrder: 1 }),
          expect.objectContaining({ id: subjectId, sortOrder: 2 }),
        ]),
      );

      const otherCourse = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/courses',
        headers: authHeader(adminToken),
        payload: {
          title: 'Grade 11 Algebra II',
          subjectId,
          academicGradeId: secondGradeId,
          accessType: 'PUBLIC',
        },
      });
      expect(otherCourse.statusCode).toBe(201);
      const otherCourseId = (await json(otherCourse)).id;

      const reorderedCourses = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/courses/reorder',
        headers: authHeader(adminToken),
        payload: {
          subjectId,
          academicGradeId: secondGradeId,
          items: [
            { id: otherCourseId, sortOrder: 1 },
            { id: secondGradeCourseId, sortOrder: 2 },
          ],
        },
      });
      expect(reorderedCourses.statusCode).toBe(201);
      const coursesInSecondGrade = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/courses?subjectId=${subjectId}&academicGradeId=${secondGradeId}`,
        headers: authHeader(adminToken),
      });
      expect((await json(coursesInSecondGrade)).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: otherCourseId, sortOrder: 1 }),
          expect.objectContaining({ id: secondGradeCourseId, sortOrder: 2 }),
        ]),
      );
    });

    it('creates a chapter under the course', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/chapters',
        headers: authHeader(adminToken),
        payload: { title: 'Chapter 1', courseId },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.courseId).toBe(courseId);
      chapterId = body.id;
    });

    it('creates a lesson under the chapter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/lessons',
        headers: authHeader(adminToken),
        payload: { title: 'Lesson 1', chapterId },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.chapterId).toBe(chapterId);
      lessonId = body.id;
    });

    it('creates a section under the lesson', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/sections',
        headers: authHeader(adminToken),
        payload: { title: 'Section 1', lessonId },
      });
      expect(response.statusCode).toBe(201);
      const body = await json(response);
      expect(body.lessonId).toBe(lessonId);
      sectionId = body.id;
    });

    it('publishes bottom-up only after each parent is published, and independently', async () => {
      // Publishing the deepest level first must fail: ancestors are still drafts.
      const tooEarly = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/sections/${sectionId}/publish`,
        headers: authHeader(adminToken),
        payload: { version: 1 },
      });
      expect(tooEarly.statusCode).toBe(409);

      const publishGrade = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-grades/${gradeId}/publish`,
        headers: authHeader(adminToken),
      });
      expect(publishGrade.statusCode).toBe(201);

      const publicGrades = await app.inject({
        method: 'GET',
        url: '/api/v1/academic-grades?page=1&limit=1',
      });
      expect(publicGrades.statusCode).toBe(200);
      expect((await json(publicGrades)).meta).toMatchObject({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect((await json(publicGrades)).data[0].id).toBe(registrationGradeId);

      const publishSubject = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/publish`,
        headers: authHeader(adminToken),
        payload: { version: 1 },
      });
      expect(publishSubject.statusCode).toBe(201);

      const publishCourse = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/courses/${courseId}/publish`,
        headers: authHeader(adminToken),
        payload: { version: 1 },
      });
      expect(publishCourse.statusCode).toBe(201);

      // Chapter/lesson/section remain DRAFT: publishing course does not cascade.
      const chapterGet = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/chapters/${chapterId}`,
        headers: authHeader(adminToken),
      });
      expect((await json(chapterGet)).status).toBe('DRAFT');
    });
  });

  describe('validation and rejection scenarios', () => {
    let gradeId: string;

    beforeAll(async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: { title: { ar: 'Grade 11', en: 'Grade 11' } },
      });
      gradeId = (await json(response)).id;
    });

    it('rejects a subject with an invalid parent (404)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: { title: 'Physics', academicGradeId: 'does-not-exist' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('rejects a duplicate slug within the same parent, allows it under a different parent (409 / 201)', async () => {
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: {
          title: 'Physics',
          slug: 'physics',
          academicGradeId: gradeId,
        },
      });
      expect(first.statusCode).toBe(201);

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: {
          title: 'Physics Again',
          slug: 'physics',
          academicGradeId: gradeId,
        },
      });
      expect(duplicate.statusCode).toBe(409);

      const otherGrade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: { title: { ar: 'Grade 12', en: 'Grade 12' } },
      });
      const otherGradeId = (await json(otherGrade)).id;

      const sameSlugDifferentParent = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: {
          title: 'Physics',
          slug: 'physics',
          academicGradeId: otherGradeId,
        },
      });
      expect(sameSlugDifferentParent.statusCode).toBe(201);
    });

    it('applies sequential PATCH updates without a concurrency token', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: { title: 'Chemistry', academicGradeId: gradeId },
      });
      const subjectId = (await json(created)).id;

      const firstPatch = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/subjects/${subjectId}`,
        headers: authHeader(adminToken),
        payload: { title: 'Chemistry I' },
      });
      expect(firstPatch.statusCode).toBe(200);

      // Versioning was removed: a second update against the same record still succeeds.
      const secondPatch = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/subjects/${subjectId}`,
        headers: authHeader(adminToken),
        payload: { title: 'Chemistry II' },
      });
      expect(secondPatch.statusCode).toBe(200);
      expect((await json(secondPatch)).title).toBe('Chemistry II');
    });

    it('rejects mutating requests from STUDENT and PARTNER roles (403), and unauthenticated requests (401)', async () => {
      const asStudent = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(studentToken),
        payload: { title: { ar: 'Blocked', en: 'Blocked' } },
      });
      expect(asStudent.statusCode).toBe(403);

      const asPartner = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(partnerToken),
        payload: { title: { ar: 'Blocked', en: 'Blocked' } },
      });
      expect(asPartner.statusCode).toBe(403);

      const unauthenticated = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        payload: { title: { ar: 'Blocked', en: 'Blocked' } },
      });
      expect(unauthenticated.statusCode).toBe(401);
    });
  });

  describe('atomic reorder and move', () => {
    let gradeId: string;
    let subjectA: { id: string };
    let subjectB: { id: string };
    let subjectC: { id: string };

    beforeAll(async () => {
      const grade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: { title: { ar: 'Reorder Grade', en: 'Reorder Grade' } },
      });
      gradeId = (await json(grade)).id;

      for (const [key, title] of [
        ['subjectA', 'Reorder Subject A'],
        ['subjectB', 'Reorder Subject B'],
        ['subjectC', 'Reorder Subject C'],
      ] as const) {
        const created = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/subjects',
          headers: authHeader(adminToken),
          payload: { title, academicGradeId: gradeId },
        });
        const body = await json(created);
        if (key === 'subjectA') subjectA = { id: body.id };
        if (key === 'subjectB') subjectB = { id: body.id };
        if (key === 'subjectC') subjectC = { id: body.id };
      }
    });

    it('rejects an invalid reorder and leaves sibling order unchanged', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects/reorder',
        headers: authHeader(adminToken),
        payload: {
          academicGradeId: gradeId,
          // Duplicate sortOrder (1 twice) is not a valid 1..N permutation.
          items: [
            { id: subjectA.id, sortOrder: 3 },
            { id: subjectB.id, sortOrder: 1 },
            { id: subjectC.id, sortOrder: 1 },
          ],
        },
      });
      expect(response.statusCode).toBe(400);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${gradeId}`,
        headers: authHeader(adminToken),
      });
      const items = (await json(list)).data;
      expect(
        items.find((i: { id: string }) => i.id === subjectA.id).sortOrder,
      ).toBe(1);
      expect(
        items.find((i: { id: string }) => i.id === subjectB.id).sortOrder,
      ).toBe(2);
      expect(
        items.find((i: { id: string }) => i.id === subjectC.id).sortOrder,
      ).toBe(3);
    });

    it('atomically reorders all siblings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects/reorder',
        headers: authHeader(adminToken),
        payload: {
          academicGradeId: gradeId,
          items: [
            { id: subjectA.id, sortOrder: 3 },
            { id: subjectB.id, sortOrder: 1 },
            { id: subjectC.id, sortOrder: 2 },
          ],
        },
      });
      expect(response.statusCode).toBe(201);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${gradeId}`,
        headers: authHeader(adminToken),
      });
      const items = (await json(list)).data;
      expect(
        items.find((i: { id: string }) => i.id === subjectB.id).sortOrder,
      ).toBe(1);
      expect(
        items.find((i: { id: string }) => i.id === subjectC.id).sortOrder,
      ).toBe(2);
      expect(
        items.find((i: { id: string }) => i.id === subjectA.id).sortOrder,
      ).toBe(3);
    });

    it('atomically moves a subject to a different academic grade and renumbers both groups', async () => {
      const targetGrade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: {
          title: { ar: 'Move Target Grade', en: 'Move Target Grade' },
        },
      });
      const targetGradeId = (await json(targetGrade)).id;

      // subjectB currently sits at sortOrder 1 in gradeId; moving it should
      // close the gap for subjectC (now at 2 -> should become 1).
      const move = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectB.id}/move`,
        headers: authHeader(adminToken),
        payload: {
          newAcademicGradeId: targetGradeId,
        },
      });
      expect(move.statusCode).toBe(201);
      expect((await json(move)).academicGradeId).toBe(targetGradeId);

      const oldGradeList = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${gradeId}`,
        headers: authHeader(adminToken),
      });
      const remaining = (await json(oldGradeList)).data;
      expect(
        remaining.find((i: { id: string }) => i.id === subjectC.id).sortOrder,
      ).toBe(1);
      expect(
        remaining.find((i: { id: string }) => i.id === subjectA.id).sortOrder,
      ).toBe(2);

      const newGradeList = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${targetGradeId}`,
        headers: authHeader(adminToken),
      });
      const moved = (await json(newGradeList)).data;
      expect(moved).toHaveLength(1);
      expect(moved[0].id).toBe(subjectB.id);
      expect(moved[0].sortOrder).toBe(1);
    });
  });

  describe('archive, restore, and eligible-draft-delete', () => {
    let gradeId: string;
    let subjectId: string;
    let subjectVersion: number;

    beforeAll(async () => {
      const grade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: { title: { ar: 'Archive Grade', en: 'Archive Grade' } },
      });
      gradeId = (await json(grade)).id;

      const subject = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/subjects',
        headers: authHeader(adminToken),
        payload: { title: 'Archive Subject', academicGradeId: gradeId },
      });
      const body = await json(subject);
      subjectId = body.id;
      subjectVersion = body.version;
    });

    it('excludes archived subjects from the default list but keeps them visible via explicit filter and direct GET', async () => {
      const archive = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/archive`,
        headers: authHeader(adminToken),
        payload: { version: subjectVersion },
      });
      expect(archive.statusCode).toBe(201);
      subjectVersion = (await json(archive)).version;

      const defaultList = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${gradeId}`,
        headers: authHeader(adminToken),
      });
      expect((await json(defaultList)).data).toHaveLength(0);

      const archivedFilterList = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects?academicGradeId=${gradeId}&status=ARCHIVED`,
        headers: authHeader(adminToken),
      });
      expect((await json(archivedFilterList)).data).toHaveLength(1);

      const directGet = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/subjects/${subjectId}`,
        headers: authHeader(adminToken),
      });
      expect(directGet.statusCode).toBe(200);
      expect((await json(directGet)).status).toBe('ARCHIVED');
    });

    it('restores an archived subject back to DRAFT', async () => {
      const restore = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/subjects/${subjectId}/restore`,
        headers: authHeader(adminToken),
        payload: { version: subjectVersion },
      });
      expect(restore.statusCode).toBe(201);
      const body = await json(restore);
      expect(body.status).toBe('DRAFT');
      subjectVersion = body.version;
    });

    it('blocks deleting a draft chapter with lessons, allows it once children are gone', async () => {
      const course = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/courses',
        headers: authHeader(adminToken),
        payload: {
          title: 'Delete Test Course',
          subjectId,
          accessType: 'PUBLIC',
        },
      });
      const courseId = (await json(course)).id;

      const chapter = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/chapters',
        headers: authHeader(adminToken),
        payload: { title: 'Delete Test Chapter', courseId },
      });
      const chapterBody = await json(chapter);
      const chapterId = chapterBody.id;

      const lesson = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/lessons',
        headers: authHeader(adminToken),
        payload: { title: 'Delete Test Lesson', chapterId },
      });
      const lessonBody = await json(lesson);

      const blockedDelete = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/chapters/${chapterId}`,
        headers: authHeader(adminToken),
        payload: { version: chapterBody.version },
      });
      expect(blockedDelete.statusCode).toBe(409);

      const deleteLesson = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/lessons/${lessonBody.id}`,
        headers: authHeader(adminToken),
        payload: { version: lessonBody.version },
      });
      expect(deleteLesson.statusCode).toBe(200);

      const nowAllowedDelete = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/chapters/${chapterId}`,
        headers: authHeader(adminToken),
        payload: { version: chapterBody.version },
      });
      expect(nowAllowedDelete.statusCode).toBe(200);
    });

    it('blocks deleting a non-draft (archived) record', async () => {
      const grade = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/academic-grades',
        headers: authHeader(adminToken),
        payload: {
          title: { ar: 'Delete Blocked Grade', en: 'Delete Blocked Grade' },
        },
      });
      const body = await json(grade);

      const archive = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/academic-grades/${body.id}/archive`,
        headers: authHeader(adminToken),
        payload: { version: body.version },
      });
      const archived = await json(archive);

      const deleteAttempt = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/academic-grades/${body.id}`,
        headers: authHeader(adminToken),
        payload: { version: archived.version },
      });
      expect(deleteAttempt.statusCode).toBe(409);
    });
  });
});
