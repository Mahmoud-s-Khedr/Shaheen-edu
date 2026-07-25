import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

export const hierarchyJourney: JourneyDefinition = {
  id: 'CONTENT-001', name: 'Academic hierarchy administration lifecycle', category: 'content', dependsOn: ['AUTH-004'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin; const create = async (path: string, body: unknown) => { const r = await admin.request<any>('POST', path, body); expectStatus(r, 201); return r.body; };
    let grade: any; let subject: any; let course: any; let chapter: any; let lesson: any; let section: any;
    await step('Creating complete academic hierarchy', async () => {
      grade = await create('/admin/academic-grades', { title: factory.title('Grade'), slug: factory.slug('grade') });
      subject = await create('/admin/subjects', { title: factory.title('Subject'), slug: factory.slug('subject'), academicGradeId: grade.id });
      course = await create('/admin/courses', { title: factory.title('Course'), slug: factory.slug('course'), subjectId: subject.id, accessType: 'PUBLIC' });
      chapter = await create('/admin/chapters', { title: factory.title('Chapter'), slug: factory.slug('chapter'), courseId: course.id });
      lesson = await create('/admin/lessons', { title: factory.title('Lesson'), slug: factory.slug('lesson'), chapterId: chapter.id });
      section = await create('/admin/sections', { title: factory.title('Section'), slug: factory.slug('section'), lessonId: lesson.id });
      assert(subject.academicGradeId === grade.id && course.subjectId === subject.id && chapter.courseId === course.id && lesson.chapterId === chapter.id && section.lessonId === lesson.id, 'Hierarchy parent IDs must match');
      Object.assign(context.academic, { gradeId: grade.id, subjectId: subject.id, courseId: course.id, chapterId: chapter.id, lessonId: lesson.id, sectionId: section.id }); for (const [kind, item] of Object.entries({ grades: grade, subjects: subject, courses: course, chapters: chapter, lessons: lesson, sections: section })) context.created[kind].push((item as any).id);
    });
    await step('Reading, updating, and rejecting invalid hierarchy parent', async () => {
      const read = await admin.request<any>('GET', `/admin/sections/${section.id}`); expectStatus(read, 200); assert(read.body.lessonId === lesson.id, 'Section read must retain parent');
      const newTitle = factory.title('Updated lesson');
      const update = await admin.request<any>('PATCH', `/admin/lessons/${lesson.id}`, { title: newTitle }); expectStatus(update, 200); lesson = update.body; assert(lesson.title === newTitle, 'Update must persist the new title');
      const invalid = await admin.request<any>('POST', '/admin/subjects', { title: factory.title('Invalid subject'), academicGradeId: 'missing-parent-id' }); expectStatus(invalid, 404);
      const denied = await clients.student.request<any>('POST', '/admin/academic-grades', { title: factory.title('Denied') }); expectStatus(denied, 403);
    });
    await step('Enforcing publish parent ordering', async () => {
      const early = await admin.request<any>('POST', `/admin/sections/${section.id}/publish`); expectStatus(early, 409);
      for (const [path, item] of [['academic-grades', grade], ['subjects', subject], ['courses', course], ['chapters', chapter], ['lessons', lesson], ['sections', section]] as const) { const published = await admin.request<any>('POST', `/admin/${path}/${item.id}/publish`); expectStatus(published, 201); assert(published.body.status === 'PUBLISHED', `${path} must publish`); }
    });
    await step('Exercising sibling reorder and move', async () => {
      const secondSubject = await create('/admin/subjects', { title: factory.title('Second subject'), slug: factory.slug('second-subject'), academicGradeId: grade.id }); context.created.subjects.push(secondSubject.id);
      const reordered = await admin.request<any>('POST', '/admin/subjects/reorder', { academicGradeId: grade.id, items: [{ id: subject.id, sortOrder: 2 }, { id: secondSubject.id, sortOrder: 1 }] }); expectStatus(reordered, 201);
      const targetGrade = await create('/admin/academic-grades', { title: factory.title('Move target grade'), slug: factory.slug('target-grade') }); context.created.grades.push(targetGrade.id);
      const moved = await admin.request<any>('POST', `/admin/subjects/${secondSubject.id}/move`, { newAcademicGradeId: targetGrade.id }); expectStatus(moved, 201); assert(moved.body.academicGradeId === targetGrade.id, 'Moved subject must point to target grade');
    });
    await step('Archiving and restoring hierarchy record', async () => {
      const draft = await create('/admin/academic-grades', { title: factory.title('Archive grade'), slug: factory.slug('archive-grade') }); context.created.grades.push(draft.id);
      const archived = await admin.request<any>('POST', `/admin/academic-grades/${draft.id}/archive`); expectStatus(archived, 201); assert(archived.body.status === 'ARCHIVED', 'Grade must archive');
      const restored = await admin.request<any>('POST', `/admin/academic-grades/${draft.id}/restore`); expectStatus(restored, 201); assert(restored.body.status === 'DRAFT', 'Grade must restore to draft');
    });
  },
};
