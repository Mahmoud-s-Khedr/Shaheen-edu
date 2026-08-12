import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-009 — Grade-scoped student catalogue, ownership, and library access. */
export const studentCatalogJourney: JourneyDefinition = {
  id: 'CONTENT-009',
  name: 'Student catalogue, access state, and library ownership',
  category: 'content',
  dependsOn: ['CONTENT-001', 'AUTH-004'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    const foreignGradeId = String(context.academic.gradeId);
    const foreignSubjectId = String(context.academic.subjectId);
    const existingStudent = context.students[0];
    let gradeId = '';
    let subjectId = '';
    let courseId = '';
    let entitledChapterId = '';
    let lockedChapterId = '';
    let contentItemId = '';
    let studentId = '';
    let studentToken = '';

    assert(
      existingStudent?.id,
      'CONTENT-009 requires the student created by AUTH-004',
    );

    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body);
      expectStatus(response, 201);
      return response.body;
    };
    const publish = async (resource: string, id: string) => {
      const response = await admin.request<any>(
        'POST',
        `/admin/${resource}/${id}/publish`,
      );
      expectStatus(response, 201);
      assert(response.body.status === 'PUBLISHED', `${resource} must publish`);
    };
    const studentRequest = <T>(
      method: 'GET' | 'PATCH',
      path: string,
      body?: unknown,
    ) =>
      clients.public.request<T>(method, path, body, {
        accessToken: studentToken,
      });

    await step('Authoring a dedicated published paid hierarchy', async () => {
      const grade = await create('/admin/academic-grades', {
        title: factory.localizedTitle('Student catalog grade'),
        slug: factory.slug('student-catalog-grade'),
      });
      gradeId = grade.id;
      context.created.grades.push(gradeId);

      const subject = await create('/admin/subjects', {
        title: factory.title('Student catalog subject'),
        slug: factory.slug('student-catalog-subject'),
        academicGradeId: gradeId,
      });
      subjectId = subject.id;
      context.created.subjects.push(subjectId);

      const course = await create('/admin/courses', {
        title: factory.title('Student catalog paid course'),
        slug: factory.slug('student-catalog-paid-course'),
        subjectId,
        accessType: 'PAID',
      });
      courseId = course.id;
      context.created.courses.push(courseId);

      const entitledChapter = await create('/admin/chapters', {
        title: factory.title('Entitled chapter'),
        slug: factory.slug('entitled-chapter'),
        courseId,
      });
      entitledChapterId = entitledChapter.id;
      context.created.chapters.push(entitledChapterId);

      const lockedChapter = await create('/admin/chapters', {
        title: factory.title('Locked chapter'),
        slug: factory.slug('locked-chapter'),
        courseId,
      });
      lockedChapterId = lockedChapter.id;
      context.created.chapters.push(lockedChapterId);

      const lesson = await create('/admin/lessons', {
        title: factory.title('Entitled lesson'),
        slug: factory.slug('entitled-lesson'),
        chapterId: entitledChapterId,
      });
      context.created.lessons.push(lesson.id);
      const section = await create('/admin/sections', {
        title: factory.title('Entitled section'),
        slug: factory.slug('entitled-section'),
        lessonId: lesson.id,
      });
      context.created.sections.push(section.id);

      const item = await create('/admin/content-items', {
        type: 'TEXT',
        title: factory.title('Entitled chapter content'),
        textBody: 'Protected catalogue content',
        accessType: 'PUBLIC',
        placement: { chapterId: entitledChapterId },
      });
      contentItemId = item.id;
      context.created.contentItems.push(contentItemId);

      for (const [resource, id] of [
        ['academic-grades', gradeId],
        ['subjects', subjectId],
        ['courses', courseId],
        ['chapters', entitledChapterId],
        ['chapters', lockedChapterId],
        ['lessons', lesson.id],
        ['sections', section.id],
        ['content-items', contentItemId],
      ]) {
        await publish(resource, id);
      }

      expectStatus(
        await admin.request<any>('POST', `/admin/pricing/course/${courseId}`, {
          isPurchasable: true,
          priceMinor: 20_000,
          currency: 'EGP',
        }),
        201,
      );
      expectStatus(
        await admin.request<any>(
          'POST',
          `/admin/pricing/chapter/${lockedChapterId}`,
          { isPurchasable: true, priceMinor: 12_000, currency: 'EGP' },
        ),
        201,
      );
    });

    await step(
      'Registering a student in the dedicated catalogue grade',
      async () => {
        const phone = factory.phone();
        const response = await clients.public.request<any>(
          'POST',
          '/auth/students/register',
          {
            fullName: factory.title('Student catalogue learner'),
            nationalId: factory.nationalId(),
            phone: `+20${phone.slice(1)}`,
            parentPhone: factory.phone(),
            governorateId: String(context.academic.governorateId),
            academicGradeId: gradeId,
            password: factory.password('StudentCatalog'),
          },
        );
        expectStatus(response, 201);
        studentId = response.body.user.id;
        studentToken = response.body.accessToken;
        context.created.students.push(studentId);
      },
    );

    await step(
      'Discovering only the current-grade published catalogue',
      async () => {
        const summary = await studentRequest<any>('GET', '/student/catalog');
        expectStatus(summary, 200);
        assert(
          summary.body.academicGrade?.id === gradeId &&
            summary.body.summary?.subjects === 1 &&
            summary.body.summary?.courses === 1 &&
            summary.body.summary?.chapters === 2,
          'Catalogue summary must describe only the student current grade',
        );

        const subjects = await studentRequest<any>(
          'GET',
          '/student/catalog/subjects',
        );
        expectStatus(subjects, 200);
        assert(
          subjects.body.data?.length === 1 &&
            subjects.body.data[0]?.id === subjectId,
          'Student subjects must be limited to the current grade',
        );

        const courses = await studentRequest<any>(
          'GET',
          `/student/catalog/subjects/${subjectId}/courses`,
        );
        expectStatus(courses, 200);
        const course = courses.body.data?.find(
          (item: any) => item.id === courseId,
        );
        assert(
          course?.access?.state === 'PURCHASABLE' &&
            course.access.price?.amountMinor === 20_000 &&
            course.access.price?.currency === 'EGP' &&
            course.isLocked === true,
          'An unentitled paid course must expose its effective EGP price',
        );

        const chapters = await studentRequest<any>(
          'GET',
          `/student/catalog/courses/${courseId}/chapters`,
        );
        expectStatus(chapters, 200);
        const inherited = chapters.body.data?.find(
          (item: any) => item.id === entitledChapterId,
        );
        const overridden = chapters.body.data?.find(
          (item: any) => item.id === lockedChapterId,
        );
        assert(
          inherited?.access?.price?.amountMinor === 20_000 &&
            overridden?.access?.price?.amountMinor === 12_000,
          'Chapter prices must respectively inherit and override course pricing',
        );

        const foreign = await studentRequest<any>(
          'GET',
          `/student/catalog/subjects/${foreignSubjectId}/courses`,
        );
        expectStatus(foreign, 404);
        const foreignCourse = await studentRequest<any>(
          'GET',
          `/student/catalog/courses/${String(context.academic.courseId)}`,
        );
        expectStatus(foreignCourse, 404);
      },
    );

    await step(
      'Applying a chapter entitlement without unlocking sibling content',
      async () => {
        expectStatus(
          await admin.request<any>('POST', '/admin/entitlements', {
            studentUserId: studentId,
            chapterId: entitledChapterId,
          }),
          201,
        );
        expectStatus(
          await admin.request<any>('POST', '/admin/entitlements', {
            studentUserId: existingStudent.id,
            courseId,
          }),
          201,
        );

        const chapters = await studentRequest<any>(
          'GET',
          `/student/catalog/courses/${courseId}/chapters`,
        );
        expectStatus(chapters, 200);
        const entitled = chapters.body.data?.find(
          (item: any) => item.id === entitledChapterId,
        );
        const locked = chapters.body.data?.find(
          (item: any) => item.id === lockedChapterId,
        );
        assert(
          chapters.body.parent?.access?.state === 'PURCHASABLE' &&
            entitled?.access?.state === 'ENTITLED' &&
            entitled.isLocked === false &&
            locked?.access?.state === 'PURCHASABLE' &&
            locked.isLocked === true,
          'A chapter grant must unlock only its chapter and descendants',
        );

        const chapter = await studentRequest<any>(
          'GET',
          `/student/catalog/chapters/${entitledChapterId}/content-items`,
        );
        expectStatus(chapter, 200);
        assert(
          chapter.body.parent?.access?.state === 'ENTITLED' &&
            chapter.body.data?.some(
              (item: any) =>
                item.id === contentItemId &&
                item.accessType === 'PUBLIC' &&
                item.access?.state === 'ENTITLED' &&
                item.isLocked === false,
            ),
          'An entitled chapter must unlock content while preserving its stored access type',
        );
      },
    );

    await step(
      'Retaining owned content in the library after a grade change',
      async () => {
        const library = await studentRequest<any>('GET', '/student/library');
        expectStatus(library, 200);
        assert(
          library.body.data?.some(
            (item: any) =>
              item.targetType === 'CHAPTER' &&
              item.target?.id === entitledChapterId &&
              item.academicGrade?.id === gradeId,
          ),
          'The library must include the active chapter entitlement and hierarchy',
        );
        assert(library.body.meta?.page === 1 && library.body.meta?.total >= 1, 'Student library must return pagination metadata');
        const searchedLibrary = await studentRequest<any>('GET', `/student/library?q=${encodeURIComponent('Entitled')}`);
        expectStatus(searchedLibrary, 200);
        assert(searchedLibrary.body.data?.some((item: any) => item.target?.id === entitledChapterId), 'Student library q search must match owned hierarchy content');

        const entitlements = await studentRequest<any>(
          'GET',
          '/student/entitlements?page=1&limit=1',
        );
        expectStatus(entitlements, 200);
        assert(
          entitlements.body.meta?.total === 1 &&
            entitlements.body.data?.[0]?.targetType === 'CHAPTER' &&
            entitlements.body.data[0]?.targetId === entitledChapterId &&
            typeof entitlements.body.data[0]?.targetName === 'string',
          'Student entitlements must be paginated, scoped to the authenticated student, and return the target name',
        );

        const changeGrade = await studentRequest<any>('PATCH', '/students/me', {
          academicGradeId: foreignGradeId,
        });
        expectStatus(changeGrade, 200);

        const hiddenAfterChange = await studentRequest<any>(
          'GET',
          `/student/catalog/courses/${courseId}`,
        );
        expectStatus(hiddenAfterChange, 404);
        const libraryAfterChange = await studentRequest<any>(
          'GET',
          '/student/library',
        );
        expectStatus(libraryAfterChange, 200);
        assert(
          libraryAfterChange.body.data?.some(
            (item: any) => item.target?.id === entitledChapterId,
          ),
          'Changing grade must not hide owned content from the student library',
        );
      },
    );
  },
};
