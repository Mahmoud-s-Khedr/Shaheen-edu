import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/**
 * CONTENT-004 — Public catalog browsing and personalized access previews.
 *
 * Verifies the frontend-facing catalog contract without exposing protected item
 * payloads to anonymous users, then verifies an active entitlement unlocks the
 * same outline for the student.
 */
export const publicCatalogJourney: JourneyDefinition = {
  id: 'CONTENT-004',
  name: 'Public catalog browsing and personalized outline access',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-004'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const gradeId = String(context.academic.gradeId);
    const subjectId = String(context.academic.subjectId);
    const studentId = context.students[0]?.id;
    const studentToken = context.students[0]?.accessToken;
    let paidCourseId = '';
    let paidContentId = '';

    assert(
      studentId && studentToken,
      'A registered student session is required',
    );

    await step(
      'Browsing published catalog collections with defaults and filters',
      async () => {
        const defaults = await clients.public.request<any>(
          'GET',
          '/catalog/subjects',
        );
        expectStatus(defaults, 200);
        assert(
          defaults.body.meta?.page === 1 && defaults.body.meta?.limit === 20,
          'Catalog defaults must be page 1 with a limit of 20',
        );

        const subjects = await clients.public.request<any>(
          'GET',
          `/catalog/subjects?academicGradeId=${gradeId}`,
        );
        expectStatus(subjects, 200);
        assert(
          subjects.body.data.some((subject: any) => subject.id === subjectId),
          'Filtered catalog subjects must include the published subject',
        );
      },
    );

    await step(
      'Authoring a paid catalog course and published course-level item',
      async () => {
        const course = await admin.request<any>('POST', '/admin/courses', {
          title: factory.title('Catalog paid course'),
          slug: factory.slug('catalog-paid-course'),
          subjectId,
          accessType: 'PAID',
        });
        expectStatus(course, 201);
        paidCourseId = course.body.id;
        context.created.courses.push(paidCourseId);

        const publishCourse = await admin.request<any>(
          'POST',
          `/admin/courses/${paidCourseId}/publish`,
        );
        expectStatus(publishCourse, 201);

        const item = await admin.request<any>('POST', '/admin/content-items', {
          type: 'TEXT',
          title: factory.title('Catalog paid lesson'),
          textBody:
            'This protected text must not appear in the catalog preview.',
          placement: { courseId: paidCourseId },
        });
        expectStatus(item, 201);
        paidContentId = item.body.id;
        context.created.contentItems.push(paidContentId);

        const publishItem = await admin.request<any>(
          'POST',
          `/admin/content-items/${paidContentId}/publish`,
        );
        expectStatus(publishItem, 201);
      },
    );

    await step(
      'Reading safe course metadata and a locked anonymous outline',
      async () => {
        const courses = await clients.public.request<any>(
          'GET',
          `/catalog/courses?subjectId=${subjectId}`,
        );
        expectStatus(courses, 200);
        assert(
          courses.body.data.some((course: any) => course.id === paidCourseId),
          'Filtered catalog courses must include the paid course',
        );

        const course = await clients.public.request<any>(
          'GET',
          `/catalog/courses/${paidCourseId}`,
        );
        expectStatus(course, 200);
        assert(
          course.body.id === paidCourseId &&
            course.body.subject?.id === subjectId,
          'Catalog course detail must include its published ancestry',
        );

        const outline = await clients.public.request<any>(
          'GET',
          `/catalog/courses/${paidCourseId}/outline`,
        );
        expectStatus(outline, 200);
        const item = outline.body.contentItems.find(
          (entry: any) => entry.id === paidContentId,
        );
        assert(
          item?.isLocked === true,
          'Anonymous users must see paid content as locked',
        );
        const serialized = JSON.stringify(outline.body);
        assert(
          !serialized.includes('This protected text') &&
            !serialized.includes('storageKey'),
          'Catalog previews must exclude protected payloads and storage internals',
        );
      },
    );

    await step(
      'Unlocking the same outline for an entitled student',
      async () => {
        const grant = await admin.request<any>('POST', '/admin/entitlements', {
          studentUserId: studentId,
          courseId: paidCourseId,
        });
        expectStatus(grant, 201);

        const outline = await clients.public.request<any>(
          'GET',
          `/catalog/courses/${paidCourseId}/outline`,
          undefined,
          { accessToken: studentToken },
        );
        expectStatus(outline, 200);
        const item = outline.body.contentItems.find(
          (entry: any) => entry.id === paidContentId,
        );
        assert(
          item?.isLocked === false,
          'An active course entitlement must unlock the catalog outline',
        );
      },
    );
  },
};
