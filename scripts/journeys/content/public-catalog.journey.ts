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
          `/catalog/subjects?academicGradeId=${gradeId}&q=${encodeURIComponent('Subject')}`,
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
        const secondItem = await admin.request<any>('POST', '/admin/content-items', {
          type: 'TEXT',
          title: factory.title('Catalog second lesson'),
          textBody: 'Second catalog preview item.',
          placement: { courseId: paidCourseId },
        });
        expectStatus(secondItem, 201);
        context.created.contentItems.push(secondItem.body.id);
        expectStatus(await admin.request<any>('POST', `/admin/content-items/${secondItem.body.id}/publish`), 201);
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
        const searchedCourses = await clients.public.request<any>('GET', `/catalog/courses?subjectId=${subjectId}&q=${encodeURIComponent('Catalog paid')}`);
        expectStatus(searchedCourses, 200);
        assert(searchedCourses.body.data.some((course: any) => course.id === paidCourseId) && searchedCourses.body.meta.total >= 1, 'Catalog q search must return matching courses with pagination metadata');

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

        const outline = await clients.public.request<any>('GET', `/catalog/courses/${paidCourseId}/content-items`);
        expectStatus(outline, 200);
        const item = outline.body.data.find(
          (entry: any) => entry.id === paidContentId,
        );
        assert(
          item?.id === paidContentId,
          'Anonymous users must see published content previews',
        );
        const serialized = JSON.stringify(outline.body);
        assert(
          !serialized.includes('This protected text') &&
            !serialized.includes('storageKey'),
          'Catalog previews must exclude protected payloads and storage internals',
        );
        const firstPage = await clients.public.request<any>('GET', `/catalog/courses/${paidCourseId}/content-items?limit=1&q=${encodeURIComponent('Catalog')}`);
        expectStatus(firstPage, 200);
        assert(firstPage.body.pageInfo?.nextCursor, 'Search cursor pagination must return a cursor when more matches exist');
        const mismatchedCursor = await clients.public.request<any>('GET', `/catalog/courses/${paidCourseId}/content-items?limit=1&q=${encodeURIComponent('Other')}&cursor=${encodeURIComponent(firstPage.body.pageInfo.nextCursor)}`);
        expectStatus(mismatchedCursor, 400);
        const punctuationOnly = await clients.public.request<any>('GET', `/catalog/courses?subjectId=${subjectId}&q=${encodeURIComponent('!!!')}`);
        expectStatus(punctuationOnly, 400);
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
          `/catalog/courses/${paidCourseId}/content-items`,
          undefined,
          { accessToken: studentToken },
        );
        expectStatus(outline, 200);
        const item = outline.body.data.find(
          (entry: any) => entry.id === paidContentId,
        );
        assert(
          item?.id === paidContentId,
          'An active course entitlement must retain catalog preview visibility',
        );
      },
    );
  },
};
