import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-017 — Weekly leaderboard and unified student performance analytics. */
export const leaderboardPerformanceJourney: JourneyDefinition = {
  id: 'CONTENT-017',
  name: 'Leaderboard and unified performance analytics',
  category: 'content',
  dependsOn: ['CONTENT-001'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    let gradeId = '',
      subjectId = '',
      courseId = '',
      chapterId = '',
      lessonId = '',
      sectionId = '',
      bankId = '',
      sourceId = '';
    let studentOne = '',
      studentTwo = '';
    let studentOneId = '',
      studentOneNationalId = '',
      studentOneParentPhone = '';
    const questionIds: string[] = [];
    const create = async (path: string, body: unknown) => {
      const response = await admin.request<any>('POST', path, body);
      expectStatus(response, 201);
      return response.body;
    };
    const publish = async (resource: string, id: string) =>
      expectStatus(
        await admin.request<any>('POST', `/admin/${resource}/${id}/publish`),
        201,
      );
    const student = <T>(
      token: string,
      method: 'GET' | 'POST',
      path: string,
      body?: unknown,
    ) => clients.public.request<T>(method, path, body, { accessToken: token });

    await step(
      'Authoring a shared public chapter and question bank',
      async () => {
        const grade = await create('/admin/academic-grades', {
          title: factory.localizedTitle('Performance grade'),
          slug: factory.slug('performance-grade'),
        });
        gradeId = grade.id;
        context.created.grades.push(gradeId);
        const subject = await create('/admin/subjects', {
          title: factory.title('Performance subject'),
          slug: factory.slug('performance-subject'),
          academicGradeId: gradeId,
        });
        subjectId = subject.id;
        context.created.subjects.push(subjectId);
        const course = await create('/admin/courses', {
          title: factory.title('Performance course'),
          slug: factory.slug('performance-course'),
          subjectId,
          accessType: 'PUBLIC',
        });
        courseId = course.id;
        context.created.courses.push(courseId);
        const chapter = await create('/admin/chapters', {
          title: factory.title('Performance chapter'),
          slug: factory.slug('performance-chapter'),
          courseId,
        });
        chapterId = chapter.id;
        context.created.chapters.push(chapterId);
        for (const [resource, id] of [
          ['academic-grades', gradeId],
          ['subjects', subjectId],
          ['courses', courseId],
          ['chapters', chapterId],
        ])
          await publish(resource, id);
        const lesson = await create('/admin/lessons', {
          title: factory.title('Performance lesson'),
          slug: factory.slug('performance-lesson'),
          chapterId,
        });
        lessonId = lesson.id;
        context.created.lessons.push(lessonId);
        await publish('lessons', lessonId);
        const section = await create('/admin/sections', {
          title: factory.title('Performance section'),
          slug: factory.slug('performance-section'),
          lessonId,
        });
        sectionId = section.id;
        context.created.sections.push(sectionId);
        await publish('sections', sectionId);
        const source = await create('/admin/question-banks/sources', {
          type: 'PLATFORM',
          title: factory.localizedTitle('Performance source'),
        });
        sourceId = source.id;
        context.created.questionSources.push(sourceId);
        const bank = await create('/admin/question-banks', {
          subjectId,
          title: factory.title('Performance bank'),
        });
        bankId = bank.id;
        context.created.questionBanks.push(bankId);
        await publish('question-banks/sources', sourceId);
        await publish('question-banks', bankId);
        for (let index = 0; index < 2; index++) {
          const question = await create('/admin/questions', {
            bankId,
            sourceId,
            courseId,
            placements: [{ sectionId }],
            body: `Performance question ${index + 1}`,
            explanation: 'Explanation',
          });
          await create(`/admin/questions/${question.id}/options`, {
            body: 'Correct',
            isCorrect: true,
          });
          await create(`/admin/questions/${question.id}/options`, {
            body: 'Wrong',
            isCorrect: false,
          });
          expectStatus(
            await admin.request<any>(
              'POST',
              `/admin/questions/${question.id}/submit`,
            ),
            201,
          );
          await publish('questions', question.id);
          questionIds.push(question.id);
          context.created.questions.push(question.id);
        }
      },
    );

    await step(
      'Registering two learners with the exact same content access',
      async () => {
        const register = async () => {
          const nationalId = factory.nationalId(),
            parentPhone = factory.phone();
          const response = await clients.public.request<any>(
            'POST',
            '/auth/students/register',
            {
              fullName: factory.title('Performance student'),
              nationalId,
              phone: `+20${factory.phone().slice(1)}`,
              parentPhone,
              governorateId: String(context.academic.governorateId),
              academicGradeId: gradeId,
              password: factory.password('Performance'),
            },
          );
          expectStatus(response, 201);
          context.created.students.push(response.body.user.id);
          return {
            token: response.body.accessToken as string,
            userId: response.body.user.id as string,
            nationalId,
            parentPhone,
          };
        };
        const first = await register(),
          second = await register();
        studentOne = first.token;
        studentOneId = first.userId;
        studentOneNationalId = first.nationalId;
        studentOneParentPhone = first.parentPhone;
        studentTwo = second.token;
      },
    );

    const completeAssessment = async (token: string, changeAnswer: boolean) => {
      const generated = await student<any>(
        token,
        'POST',
        '/student/assessments',
        {
          questionBankIds: [bankId],
          chapterIds: [chapterId],
          sourceIds: [sourceId],
          questionCount: 2,
          mode: 'EXAM',
        },
      );
      expectStatus(generated, 201);
      const started = await student<any>(
        token,
        'POST',
        `/student/assessments/${generated.body.id}/attempts/start`,
      );
      expectStatus(started, 201);
      const question = started.body.questions[0];
      const wrong = question.options.find(
        (option: any) => option.body === 'Wrong',
      ).id;
      const correct = question.options.find(
        (option: any) => option.body === 'Correct',
      ).id;
      expectStatus(
        await student<any>(
          token,
          'POST',
          `/student/assessments/${generated.body.id}/attempts/current/answers/${question.id}`,
          { selectedOptionIds: changeAnswer ? [wrong] : [correct] },
        ),
        201,
      );
      if (changeAnswer)
        expectStatus(
          await student<any>(
            token,
            'POST',
            `/student/assessments/${generated.body.id}/attempts/current/answers/${question.id}`,
            { selectedOptionIds: [correct] },
          ),
          201,
        );
      expectStatus(
        await student<any>(
          token,
          'POST',
          `/student/assessments/${generated.body.id}/attempts/current/submit`,
        ),
        201,
      );
    };

    await step(
      'Completing comparable assessments and recording an answer correction',
      async () => {
        await completeAssessment(studentOne, true);
        await completeAssessment(studentTwo, false);
        const practice = await student<any>(
          studentOne,
          'GET',
          `/student/practice/questions?chapterId=${chapterId}`,
        );
        expectStatus(practice, 200);
        const first = practice.body.data[0];
        const correct = first.options.find(
          (option: any) => option.body === 'Correct',
        ).id;
        expectStatus(
          await student<any>(
            studentOne,
            'POST',
            `/student/practice/questions/${first.id}/attempts`,
            { optionIds: [correct] },
          ),
          201,
        );
      },
    );

    await step(
      'Reading leaderboard and unified performance analytics',
      async () => {
        const leaderboard = await student<any>(
          studentOne,
          'GET',
          '/student/leaderboard/current',
        );
        expectStatus(leaderboard, 200);
        assert(
          leaderboard.body.week?.key &&
            leaderboard.body.data.some(
              (row: any) =>
                row.rank === 1 && typeof row.smartScore === 'number',
            ),
          'The weekly leaderboard must return ranked Smart Scores',
        );
        const currentWeek = new Date(
          `${leaderboard.body.week.key}T00:00:00.000Z`,
        );
        currentWeek.setUTCDate(currentWeek.getUTCDate() - 7);
        const previousWeekKey = currentWeek.toISOString().slice(0, 10);
        const history = await student<any>(
          studentOne,
          'GET',
          `/student/leaderboard/history/${previousWeekKey}`,
        );
        expectStatus(history, 200);
        assert(
          history.body.week?.key === previousWeekKey &&
            history.body.week.finalizedAt &&
            history.body.meta?.page === 1,
          'Leaderboard history must return the finalized prior-week result and pagination metadata',
        );
        const overview = await student<any>(
          studentOne,
          'GET',
          '/student/performance/overview',
        );
        expectStatus(overview, 200);
        assert(
          overview.body.total === 3 &&
            overview.body.correct === 2 &&
            overview.body.omitted === 1 &&
            overview.body.sources.assessment.total === 2 &&
            overview.body.sources.practice.total === 1 &&
            overview.body.questionBank.used >= 1,
          'Overview must combine completed assessment outcomes and direct-practice activity',
        );
        const analysis = await student<any>(
          studentOne,
          'GET',
          `/student/performance/analysis?level=section&subjectId=${subjectId}&sectionId=${sectionId}`,
        );
        expectStatus(analysis, 200);
        assert(
          analysis.body.level === 'section' &&
            analysis.body.data.some(
              (row: any) =>
                row.id === sectionId &&
                row.correct === 2 &&
                row.omitted === 1 &&
                row.sources.practice.total === 1,
            ),
          'Section analysis must expose unified correct, omitted, and source totals',
        );
        const trends = await student<any>(
          studentOne,
          'GET',
          '/student/performance/trends',
        );
        expectStatus(trends, 200);
        assert(
          trends.body.data.length >= 1 &&
            trends.body.data[0].total === 3 &&
            trends.body.data[0].sources.practice.total === 1 &&
            trends.body.trend.status === 'INSUFFICIENT_DATA',
          'Trends must include unified daily activity and an evidence-safe classification',
        );
        const insights = await student<any>(
          studentOne,
          'GET',
          `/student/performance/insights?sectionId=${sectionId}`,
        );
        expectStatus(insights, 200);
        assert(
          insights.body.status === 'INSUFFICIENT_DATA' &&
            Array.isArray(insights.body.recommendations) &&
            insights.body.trend.status === 'INSUFFICIENT_DATA',
          'Insights must return an evidence-safe result for limited activity',
        );
        const peers = await student<any>(
          studentOne,
          'GET',
          `/student/performance/peers?subjectId=${subjectId}&courseId=${courseId}&sectionId=${sectionId}`,
        );
        expectStatus(peers, 200);
        assert(
          peers.body.status === 'INSUFFICIENT_DATA' &&
            peers.body.scope.sectionId === sectionId &&
            peers.body.cohort.type === 'GRADE_SHARED_SCOPE' &&
            peers.body.distribution === null,
          'Peer comparison must withhold aggregate distribution data below the privacy threshold',
        );
        const changes = await student<any>(
          studentOne,
          'GET',
          `/student/performance/answer-changes?sectionId=${sectionId}`,
        );
        expectStatus(changes, 200);
        assert(
          changes.body.incorrectToCorrect === 1 &&
            changes.body.totalChanges === 1,
          'Performance must report persisted incorrect-to-correct answer changes',
        );
      },
    );

    await step(
      'Reading the selected-child unified performance views',
      async () => {
        const login = await clients.public.request<any>(
          'POST',
          '/auth/parents/login',
          {
            nationalId: studentOneNationalId,
            parentPhone: studentOneParentPhone,
          },
        );
        expectStatus(login, 201);
        const selected = await clients.public.request<any>(
          'POST',
          '/auth/parents/select-child',
          { studentUserId: studentOneId },
          { accessToken: login.body.accessToken },
        );
        expectStatus(selected, 201);
        const parentToken = selected.body.accessToken as string;
        const parentOverview = await clients.public.request<any>(
          'GET',
          '/parent/selected-child/performance',
          undefined,
          { accessToken: parentToken },
        );
        expectStatus(parentOverview, 200);
        assert(
          parentOverview.body.total === 3 &&
            parentOverview.body.sources.practice.total === 1,
          'Parent overview must use the selected child unified activity',
        );
        const parentAnalysis = await clients.public.request<any>(
          'GET',
          `/parent/selected-child/performance/analysis?level=section&sectionId=${sectionId}`,
          undefined,
          { accessToken: parentToken },
        );
        expectStatus(parentAnalysis, 200);
        assert(
          parentAnalysis.body.data.some((row: any) => row.id === sectionId),
          'Parent analysis must expose selected-child section performance',
        );
        const parentTrends = await clients.public.request<any>(
          'GET',
          '/parent/selected-child/performance/trends',
          undefined,
          { accessToken: parentToken },
        );
        expectStatus(parentTrends, 200);
        const parentInsights = await clients.public.request<any>(
          'GET',
          '/parent/selected-child/performance/insights',
          undefined,
          { accessToken: parentToken },
        );
        expectStatus(parentInsights, 200);
        assert(
          Array.isArray(parentTrends.body.data) &&
            Array.isArray(parentInsights.body.recommendations),
          'Parent trend and insight responses must remain aggregate and read-only',
        );
      },
    );
  },
};
