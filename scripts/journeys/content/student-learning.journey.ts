import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-013 — Student completion, direct practice, immutable retries, and parent summary. */
export const studentLearningJourney: JourneyDefinition = {
  id: 'CONTENT-013',
  name: 'Student learning completion and direct-practice performance',
  category: 'content',
  dependsOn: ['CONTENT-001'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    let gradeId = ''; let courseId = ''; let chapterId = ''; let lessonId = ''; let sectionId = ''; let contentItemId = ''; let questionId = ''; let correctOptionId = ''; let wrongOptionId = '';
    let studentId = ''; let studentToken = ''; let nationalId = ''; let parentPhone = '';
    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body); expectStatus(response, 201); return response.body;
    };
    const publish = async (resource: string, id: string) => {
      const response = await admin.request<any>('POST', `/admin/${resource}/${id}/publish`); expectStatus(response, 201);
    };
    const student = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => clients.public.request<T>(method, path, body, { accessToken: studentToken });

    await step('Authoring published public learning content and one practice question', async () => {
      const grade = await create('/admin/academic-grades', { title: factory.localizedTitle('Learning grade'), slug: factory.slug('learning-grade') }); gradeId = grade.id; context.created.grades.push(gradeId);
      const subject = await create('/admin/subjects', { title: factory.title('Learning subject'), slug: factory.slug('learning-subject'), academicGradeId: gradeId }); context.created.subjects.push(subject.id);
      const course = await create('/admin/courses', { title: factory.title('Learning course'), slug: factory.slug('learning-course'), subjectId: subject.id, accessType: 'PUBLIC' }); courseId = course.id; context.created.courses.push(courseId);
      const chapter = await create('/admin/chapters', { title: factory.title('Learning chapter'), slug: factory.slug('learning-chapter'), courseId }); chapterId = chapter.id; context.created.chapters.push(chapterId);
      const lesson = await create('/admin/lessons', { title: factory.title('Learning lesson'), slug: factory.slug('learning-lesson'), chapterId }); lessonId = lesson.id; context.created.lessons.push(lessonId);
      const section = await create('/admin/sections', { title: factory.title('Learning section'), slug: factory.slug('learning-section'), lessonId }); sectionId = section.id; context.created.sections.push(sectionId);
      const content = await create('/admin/content-items', { type: 'TEXT', title: factory.title('Learning text'), textBody: 'Completion is item-level.', placement: { sectionId } }); contentItemId = content.id; context.created.contentItems.push(contentItemId);
      for (const [resource, id] of [['academic-grades', gradeId], ['subjects', subject.id], ['courses', courseId], ['chapters', chapterId], ['lessons', lessonId], ['sections', sectionId], ['content-items', contentItemId]]) await publish(resource, id);

      const source = await create('/admin/question-banks/sources', { type: 'PLATFORM', title: factory.localizedTitle('Learning source') }); context.created.questionSources.push(source.id);
      const bank = await create('/admin/question-banks', { title: factory.title('Learning bank') }); context.created.questionBanks.push(bank.id);
      await publish('question-banks/sources', source.id); await publish('question-banks', bank.id);
      const question = await create('/admin/questions', { bankId: bank.id, sourceId: source.id, courseId, placements: [{ sectionId }], body: 'Which option is correct?', explanation: 'The first option is correct.' }); questionId = question.id; context.created.questions.push(questionId);
      const first = await create(`/admin/questions/${questionId}/options`, { body: 'Correct', isCorrect: true }); correctOptionId = first.options[0].id;
      const second = await create(`/admin/questions/${questionId}/options`, { body: 'Wrong', isCorrect: false }); wrongOptionId = second.options.find((option: any) => option.id !== correctOptionId).id;
    });

    await step('Publishing the reviewed practice question', async () => {
      expectStatus(await admin.request<any>('POST', `/admin/questions/${questionId}/submit`), 201);
      expectStatus(await admin.request<any>('POST', `/admin/questions/${questionId}/publish`), 201);
    });

    await step('Registering the learner and observing item-level completion', async () => {
      nationalId = factory.nationalId(); parentPhone = factory.phone();
      const registration = await clients.public.request<any>('POST', '/auth/students/register', { fullName: factory.title('Learning student'), nationalId, phone: `+20${factory.phone().slice(1)}`, parentPhone, governorateId: String(context.academic.governorateId), academicGradeId: gradeId, password: factory.password('Learning') });
      expectStatus(registration, 201); studentId = registration.body.user.id; studentToken = registration.body.accessToken; context.created.students.push(studentId);
      const delivery = await student<any>('GET', `/student/content-items/${contentItemId}`); expectStatus(delivery, 200); assert(delivery.body.progress?.completed === false, 'New content must start incomplete');
      expectStatus(await student<any>('POST', `/student/content-items/${contentItemId}/complete`), 201);
      const repeat = await student<any>('POST', `/student/content-items/${contentItemId}/complete`); expectStatus(repeat, 201);
      const after = await student<any>('GET', `/student/content-items/${contentItemId}`); expectStatus(after, 200); assert(after.body.progress?.completed === true, 'Completed content must be returned by delivery');
    });

    await step('Deriving progress at every hierarchy level', async () => {
      const progress = await student<any>('GET', '/student/progress'); expectStatus(progress, 200);
      assert(progress.body.content?.completedItems === 1 && progress.body.courses?.some((node: any) => node.id === courseId && node.completed), 'Course progress must be derived from the completed content item');
      assert(progress.body.chapters?.some((node: any) => node.id === chapterId && node.completed) && progress.body.lessons?.some((node: any) => node.id === lessonId && node.completed) && progress.body.sections?.some((node: any) => node.id === sectionId && node.completed), 'Chapter, lesson, and section must roll up completion');
      const library = await student<any>('GET', `/student/library/COURSE/${courseId}/progress`); expectStatus(library, 200); assert(library.body.nodes?.some((node: any) => node.id === courseId && node.completed), 'Detailed library progress must include the completed course');
    });

    await step('Recording immutable wrong and correct direct-practice attempts', async () => {
      const questions = await student<any>('GET', `/student/practice/questions?courseId=${courseId}`); expectStatus(questions, 200); assert(questions.body.data?.some((question: any) => question.id === questionId), 'Course practice must include descendant section questions');
      const wrong = await student<any>('POST', `/student/practice/questions/${questionId}/attempts`, { optionIds: [wrongOptionId] }); expectStatus(wrong, 201); assert(wrong.body.isCorrect === false && wrong.body.attemptNumber === 1, 'First wrong answer must be retained');
      const correct = await student<any>('POST', `/student/practice/questions/${questionId}/attempts`, { optionIds: [correctOptionId] }); expectStatus(correct, 201); assert(correct.body.isCorrect === true && correct.body.attemptNumber === 2 && correct.body.explanation, 'Correct retry must return feedback');
      const history = await student<any>('GET', `/student/practice/questions/${questionId}/attempts`); expectStatus(history, 200); assert(history.body.data?.length === 2 && history.body.data[0].selectedOptionIds[0] === wrongOptionId && history.body.data[1].selectedOptionIds[0] === correctOptionId, 'Attempt history must preserve each selected answer');
      const missingAsset = await student<any>('GET', `/student/practice/questions/${questionId}/assets/missing/access`); expectStatus(missingAsset, 404);
      const performance = await student<any>('GET', '/student/performance'); expectStatus(performance, 200); assert(performance.body.attemptedQuestions === 1 && performance.body.solvedQuestions === 1 && performance.body.totalAttempts === 2, 'Performance must summarize the retry history');
    });

    await step('Showing only summary performance to the selected parent', async () => {
      const login = await clients.public.request<any>('POST', '/auth/parents/login', { nationalId, parentPhone }); expectStatus(login, 201);
      const select = await clients.public.request<any>('POST', '/auth/parents/select-child', { studentUserId: studentId }, { accessToken: login.body.accessToken }); expectStatus(select, 201);
      const parent = await clients.public.request<any>('GET', '/parent/selected-child/performance', undefined, { accessToken: select.body.accessToken }); expectStatus(parent, 200);
      assert(parent.body.child?.userId === studentId && parent.body.performance?.solvedQuestions === 1 && !JSON.stringify(parent.body).includes('selectedOptionIds'), 'Parent performance must be summary-only');
    });
  },
};
