import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-017 — Weekly leaderboard and shared-content student performance analytics. */
export const leaderboardPerformanceJourney: JourneyDefinition = {
  id: 'CONTENT-017',
  name: 'Leaderboard and shared-content performance analytics',
  category: 'content',
  dependsOn: ['CONTENT-001'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    let gradeId = '', subjectId = '', courseId = '', chapterId = '', bankId = '', sourceId = '';
    let studentOne = '', studentTwo = '';
    const questionIds: string[] = [];
    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body); expectStatus(response, 201); return response.body;
    };
    const publish = async (resource: string, id: string) => expectStatus(await admin.request<any>('POST', `/admin/${resource}/${id}/publish`), 201);
    const student = <T>(token: string, method: 'GET' | 'POST', path: string, body?: unknown) => clients.public.request<T>(method, path, body, { accessToken: token });

    await step('Authoring a shared public chapter and question bank', async () => {
      const grade = await create('/admin/academic-grades', { title: factory.localizedTitle('Performance grade'), slug: factory.slug('performance-grade') }); gradeId = grade.id; context.created.grades.push(gradeId);
      const subject = await create('/admin/subjects', { title: factory.title('Performance subject'), slug: factory.slug('performance-subject'), academicGradeId: gradeId }); subjectId = subject.id; context.created.subjects.push(subjectId);
      const course = await create('/admin/courses', { title: factory.title('Performance course'), slug: factory.slug('performance-course'), subjectId, accessType: 'PUBLIC' }); courseId = course.id; context.created.courses.push(courseId);
      const chapter = await create('/admin/chapters', { title: factory.title('Performance chapter'), slug: factory.slug('performance-chapter'), courseId }); chapterId = chapter.id; context.created.chapters.push(chapterId);
      for (const [resource, id] of [['academic-grades', gradeId], ['subjects', subjectId], ['courses', courseId], ['chapters', chapterId]]) await publish(resource, id);
      const source = await create('/admin/question-banks/sources', { type: 'PLATFORM', title: factory.localizedTitle('Performance source') }); sourceId = source.id; context.created.questionSources.push(sourceId);
      const bank = await create('/admin/question-banks', { subjectId, title: factory.title('Performance bank') }); bankId = bank.id; context.created.questionBanks.push(bankId);
      await publish('question-banks/sources', sourceId); await publish('question-banks', bankId);
      for (let index = 0; index < 2; index++) {
        const question = await create('/admin/questions', { bankId, sourceId, courseId, placements: [{ chapterId }], body: `Performance question ${index + 1}`, explanation: 'Explanation' });
        await create(`/admin/questions/${question.id}/options`, { body: 'Correct', isCorrect: true });
        await create(`/admin/questions/${question.id}/options`, { body: 'Wrong', isCorrect: false });
        expectStatus(await admin.request<any>('POST', `/admin/questions/${question.id}/submit`), 201);
        await publish('questions', question.id); questionIds.push(question.id); context.created.questions.push(question.id);
      }
    });

    await step('Registering two learners with the exact same content access', async () => {
      const register = async () => {
        const response = await clients.public.request<any>('POST', '/auth/students/register', { fullName: factory.title('Performance student'), nationalId: factory.nationalId(), phone: `+20${factory.phone().slice(1)}`, parentPhone: factory.phone(), governorateId: String(context.academic.governorateId), academicGradeId: gradeId, password: factory.password('Performance') });
        expectStatus(response, 201); context.created.students.push(response.body.user.id); return response.body.accessToken as string;
      };
      studentOne = await register(); studentTwo = await register();
    });

    const completeAssessment = async (token: string, changeAnswer: boolean) => {
      const generated = await student<any>(token, 'POST', '/student/assessments', { questionBankIds: [bankId], chapterIds: [chapterId], sourceIds: [sourceId], questionCount: 2, mode: 'EXAM' }); expectStatus(generated, 201);
      const started = await student<any>(token, 'POST', `/student/assessments/${generated.body.id}/attempts/start`); expectStatus(started, 201);
      const question = started.body.questions[0]; const wrong = question.options.find((option: any) => option.body === 'Wrong').id; const correct = question.options.find((option: any) => option.body === 'Correct').id;
      expectStatus(await student<any>(token, 'POST', `/student/assessments/${generated.body.id}/attempts/current/answers/${question.id}`, { selectedOptionIds: changeAnswer ? [wrong] : [correct] }), 201);
      if (changeAnswer) expectStatus(await student<any>(token, 'POST', `/student/assessments/${generated.body.id}/attempts/current/answers/${question.id}`, { selectedOptionIds: [correct] }), 201);
      expectStatus(await student<any>(token, 'POST', `/student/assessments/${generated.body.id}/attempts/current/submit`), 201);
    };

    await step('Completing comparable assessments and recording an answer correction', async () => {
      await completeAssessment(studentOne, true); await completeAssessment(studentTwo, false);
      const practice = await student<any>(studentOne, 'GET', `/student/practice/questions?chapterId=${chapterId}`); expectStatus(practice, 200);
      const first = practice.body.data[0]; const correct = first.options.find((option: any) => option.body === 'Correct').id;
      expectStatus(await student<any>(studentOne, 'POST', `/student/practice/questions/${first.id}/attempts`, { optionIds: [correct] }), 201);
    });

    await step('Reading leaderboard and performance analytics', async () => {
      const leaderboard = await student<any>(studentOne, 'GET', '/student/leaderboard/current'); expectStatus(leaderboard, 200);
      assert(leaderboard.body.week?.key && leaderboard.body.data.some((row: any) => row.rank === 1 && typeof row.smartScore === 'number'), 'The weekly leaderboard must return ranked Smart Scores');
      const currentWeek = new Date(`${leaderboard.body.week.key}T00:00:00.000Z`);
      currentWeek.setUTCDate(currentWeek.getUTCDate() - 7);
      const previousWeekKey = currentWeek.toISOString().slice(0, 10);
      const history = await student<any>(studentOne, 'GET', `/student/leaderboard/history/${previousWeekKey}`); expectStatus(history, 200);
      assert(history.body.week?.key === previousWeekKey && history.body.week.finalizedAt && history.body.meta?.page === 1, 'Leaderboard history must return the finalized prior-week result and pagination metadata');
      const overview = await student<any>(studentOne, 'GET', '/student/performance/overview'); expectStatus(overview, 200);
      assert(overview.body.tests.completed === 1 && overview.body.questionBank.used >= 1 && overview.body.assessmentScore.omitted === 1, 'Overview must combine completed assessment outcomes and unique QBank usage');
      const analysis = await student<any>(studentOne, 'GET', `/student/performance/analysis?level=chapter&subjectId=${subjectId}`); expectStatus(analysis, 200);
      assert(analysis.body.data.some((row: any) => row.id === chapterId && row.correct === 1 && row.omitted === 1), 'Chapter analysis must expose correct and omitted totals');
      const trends = await student<any>(studentOne, 'GET', '/student/performance/trends'); expectStatus(trends, 200);
      assert(trends.body.data.length >= 1 && trends.body.data[0].testsCompleted >= 1, 'Trends must include completed assessment buckets');
      const peers = await student<any>(studentOne, 'GET', `/student/performance/peers?subjectId=${subjectId}&courseId=${courseId}&chapterId=${chapterId}`); expectStatus(peers, 200);
      assert(peers.body.scope.courseId === courseId && peers.body.scope.chapterIds.includes(chapterId) && peers.body.cohort.type === 'SHARED_CONTENT_SCOPE', 'Peer comparison must expose the exact shared course and chapter scope');
      const changes = await student<any>(studentOne, 'GET', '/student/performance/answer-changes'); expectStatus(changes, 200);
      assert(changes.body.incorrectToCorrect === 1 && changes.body.totalChanges === 1, 'Performance must report persisted incorrect-to-correct answer changes');
    });
  },
};
