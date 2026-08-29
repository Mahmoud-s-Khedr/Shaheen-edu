import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-016 — Student-generated and admin-generated quizzes/exams, privacy, and the attempt lifecycle. */
export const assessmentsJourney: JourneyDefinition = {
  id: 'CONTENT-016',
  name: 'Student and admin generated assessments',
  category: 'content',
  dependsOn: ['CONTENT-013'],
  async run({ clients, context, factory, step }) {
    const admin = clients.admin;
    let gradeId = '';
    let subjectId = '';
    let courseId = '';
    let chapterId = '';
    let questionBankId = '';
    let secondQuestionBankId = '';
    let questionSourceId = '';
    let questionIds: string[] = [];
    let student1Token = '';
    let student2Token = '';
    let studentAssessmentId = '';
    let adminAssessmentId = '';
    let writtenAssessmentId = '';
    let writtenShortQuestionId = '';
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
    };
    const student = <T>(
      token: string,
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: string,
      body?: unknown,
    ) => clients.public.request<T>(method, path, body, { accessToken: token });

    await step(
      'Authoring a published course with three published questions',
      async () => {
        const grade = await create('/admin/academic-grades', {
          title: factory.localizedTitle('Assessments grade'),
          slug: factory.slug('assessments-grade'),
        });
        gradeId = grade.id;
        context.created.grades.push(gradeId);
        const subject = await create('/admin/subjects', {
          title: factory.title('Assessments subject'),
          slug: factory.slug('assessments-subject'),
          academicGradeId: gradeId,
        });
        subjectId = subject.id;
        context.created.subjects.push(subject.id);
        const course = await create('/admin/courses', {
          title: factory.title('Assessments course'),
          slug: factory.slug('assessments-course'),
          subjectId: subject.id,
          accessType: 'PUBLIC',
        });
        courseId = course.id;
        context.created.courses.push(courseId);
        for (const [resource, id] of [
          ['academic-grades', gradeId],
          ['subjects', subject.id],
          ['courses', courseId],
        ])
          await publish(resource, id);

        const chapter = await create('/admin/chapters', {
          title: factory.title('Assessments chapter'),
          slug: factory.slug('assessments-chapter'),
          courseId,
        });
        chapterId = chapter.id;
        context.created.chapters.push(chapterId);
        await publish('chapters', chapterId);

        const source = await create('/admin/question-banks/sources', {
          type: 'PLATFORM',
          title: factory.localizedTitle('Assessments source'),
        });
        questionSourceId = source.id;
        context.created.questionSources.push(source.id);
        const bank = await create('/admin/question-banks', {
          subjectId,
          title: factory.title('Assessments bank'),
        });
        questionBankId = bank.id;
        context.created.questionBanks.push(bank.id);
        await publish('question-banks/sources', source.id);
        await publish('question-banks', bank.id);

        const secondBank = await create('/admin/question-banks', {
          subjectId,
          title: factory.title('Assessments second bank'),
        });
        secondQuestionBankId = secondBank.id;
        context.created.questionBanks.push(secondBank.id);
        await publish('question-banks', secondBank.id);

        for (let i = 0; i < 3; i++) {
          const question = await create('/admin/questions', {
            bankId: bank.id,
            sourceId: source.id,
            courseId,
            placements: [{ chapterId }],
            body: `Assessment question ${i + 1}`,
            explanation: `Explanation ${i + 1}`,
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
          expectStatus(
            await admin.request<any>(
              'POST',
              `/admin/questions/${question.id}/publish`,
            ),
            201,
          );
          questionIds.push(question.id);
          context.created.questions.push(question.id);
        }

        const secondBankQuestion = await create('/admin/questions', {
          bankId: secondQuestionBankId,
          sourceId: source.id,
          courseId,
          placements: [{ chapterId }],
          body: 'Assessment question from second bank',
          explanation: 'Second-bank explanation',
        });
        await create(`/admin/questions/${secondBankQuestion.id}/options`, {
          body: 'Correct',
          isCorrect: true,
        });
        await create(`/admin/questions/${secondBankQuestion.id}/options`, {
          body: 'Wrong',
          isCorrect: false,
        });
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${secondBankQuestion.id}/submit`,
          ),
          201,
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/questions/${secondBankQuestion.id}/publish`,
          ),
          201,
        );
        context.created.questions.push(secondBankQuestion.id);
      },
    );

    await step('Registering two students in the published grade', async () => {
      const register = async () => {
        const nationalId = factory.nationalId();
        const phone = `+20${factory.phone().slice(1)}`;
        const parentPhone = factory.phone();
        const response = await clients.public.request<any>(
          'POST',
          '/auth/students/register',
          {
            fullName: factory.title('Assessments student'),
            nationalId,
            phone,
            parentPhone,
            governorateId: String(context.academic.governorateId),
            academicGradeId: gradeId,
            password: factory.password('Assessments'),
          },
        );
        expectStatus(response, 201);
        context.created.students.push(response.body.user.id);
        return response.body.accessToken as string;
      };
      student1Token = await register();
      student2Token = await register();
    });

    await step(
      'Managing student-private highlights, notebook pages, and subject constants',
      async () => {
        const highlight = await student<any>(
          student1Token,
          'POST',
          `/student/questions/${questionIds[0]}/highlights`,
          {
            selectedText: 'Assessment',
            startOffset: 0,
            endOffset: 10,
            color: 'yellow',
          },
        );
        expectStatus(highlight, 201);
        assert(
          highlight.body.questionId === questionIds[0] &&
            highlight.body.selectedText === 'Assessment' &&
            highlight.body.color === 'yellow',
          'A student must be able to create a highlight with recoverable text offsets',
        );
        const highlights = await student<any>(
          student1Token,
          'GET',
          `/student/questions/${questionIds[0]}/highlights`,
        );
        expectStatus(highlights, 200);
        assert(
          highlights.body.data?.some(
            (item: any) => item.id === highlight.body.id,
          ),
          'A student must only receive their own question highlights',
        );
        const invalidHighlight = await student<any>(
          student1Token,
          'POST',
          `/student/questions/${questionIds[0]}/highlights`,
          { selectedText: 'wrong', startOffset: 0, endOffset: 10 },
        );
        expectStatus(invalidHighlight, 400);
        const foreignDelete = await student<any>(
          student2Token,
          'DELETE',
          `/student/questions/${questionIds[0]}/highlights/${highlight.body.id}`,
        );
        expectStatus(foreignDelete, 404);
        expectStatus(
          await student<any>(
            student1Token,
            'DELETE',
            `/student/questions/${questionIds[0]}/highlights/${highlight.body.id}`,
          ),
          200,
        );

        const page = await student<any>(
          student1Token,
          'POST',
          '/student/notebook/pages',
          { title: 'Assessment revision', content: '<p>Private notes</p>' },
        );
        expectStatus(page, 201);
        const foreignPage = await student<any>(
          student2Token,
          'GET',
          `/student/notebook/pages/${page.body.id}`,
        );
        expectStatus(foreignPage, 404);
        const updatedPage = await student<any>(
          student1Token,
          'PATCH',
          `/student/notebook/pages/${page.body.id}`,
          { content: '<p>Updated private notes</p>' },
        );
        expectStatus(updatedPage, 200);
        const pages = await student<any>(
          student1Token,
          'GET',
          '/student/notebook/pages',
        );
        expectStatus(pages, 200);
        assert(
          pages.body.data?.some(
            (item: any) =>
              item.id === page.body.id &&
              item.content === '<p>Updated private notes</p>',
          ),
          'Notebook page CRUD must be strictly student-scoped',
        );
        expectStatus(
          await student<any>(
            student1Token,
            'DELETE',
            `/student/notebook/pages/${page.body.id}`,
          ),
          200,
        );

        const constant = await admin.request<any>(
          'POST',
          `/admin/subjects/${subjectId}/constants`,
          { key: 'gravity', value: '9.8' },
        );
        expectStatus(constant, 201);
        const adminConstants = await admin.request<any>(
          'GET',
          `/admin/subjects/${subjectId}/constants`,
        );
        expectStatus(adminConstants, 200);
        assert(
          adminConstants.body.data?.some(
            (item: any) =>
              item.id === constant.body.id && item.key === 'gravity',
          ),
          'Administrators must be able to list constants for their subject',
        );
        const adminConstant = await admin.request<any>(
          'GET',
          `/admin/subjects/${subjectId}/constants/${constant.body.id}`,
        );
        expectStatus(adminConstant, 200);
        const updatedConstant = await admin.request<any>(
          'PATCH',
          `/admin/subjects/${subjectId}/constants/${constant.body.id}`,
          { value: '9.81' },
        );
        expectStatus(updatedConstant, 200);
        assert(
          updatedConstant.body.id === constant.body.id &&
            updatedConstant.body.value === '9.81',
          'Administrators must be able to update a subject constant',
        );
        const publicConstants = await clients.public.request<any>(
          'GET',
          `/subjects/${subjectId}/constants`,
        );
        expectStatus(publicConstants, 200);
        assert(
          publicConstants.body.data?.some(
            (item: any) => item.key === 'gravity' && item.value === '9.81',
          ),
          'Subject constants must be publicly readable for calculators',
        );
        const duplicateConstant = await admin.request<any>(
          'POST',
          `/admin/subjects/${subjectId}/constants`,
          { key: 'gravity', value: '9.81' },
        );
        expectStatus(duplicateConstant, 409);
        const studentWrite = await student<any>(
          student1Token,
          'POST',
          `/admin/subjects/${subjectId}/constants`,
          { key: 'student-write', value: 'nope' },
        );
        expectStatus(studentWrite, 403);
        expectStatus(
          await admin.request<any>(
            'DELETE',
            `/admin/subjects/${subjectId}/constants/${constant.body.id}`,
          ),
          200,
        );
      },
    );

    await step(
      'Rejecting invalid student voice uploads before transcription',
      async () => {
        const upload = await clients.public.upload<any>(
          '/student/voice/transcriptions',
          {
            buffer: Buffer.from('not an audio recording'),
            filename: 'answer.txt',
            contentType: 'text/plain',
          },
          { accessToken: student1Token, expected: 400 },
        );
        expectStatus(upload, 400);
      },
    );

    await step(
      'Discovering banks and generating optional/multi-bank private assessments',
      async () => {
        const banks = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/question-banks?subjectId=${subjectId}`,
        );
        expectStatus(banks, 200);
        assert(
          banks.body.data.some(
            (item: any) =>
              item.id === questionBankId && item.availableQuestionCount === 3,
          ),
          'A student must discover only an accessible bank with its available count',
        );
        assert(
          banks.body.data.some(
            (item: any) =>
              item.id === secondQuestionBankId &&
              item.availableQuestionCount === 1,
          ),
          'A student must discover every accessible selected bank with its available count',
        );
        const sources = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/question-sources?questionBankId=${questionBankId}`,
        );
        expectStatus(sources, 200);
        assert(
          sources.body.data.some(
            (item: any) =>
              item.id === questionSourceId && item.type === 'PLATFORM',
          ),
          'A bank source list must be learner-safe and accessible',
        );
        expectStatus(
          await student<any>(
            student1Token,
            'POST',
            `/student/assessments/question-marks/${questionIds[0]}`,
          ),
          201,
        );
        const marks = await student<any>(
          student1Token,
          'GET',
          '/student/assessments/question-marks',
        );
        expectStatus(marks, 200);
        assert(
          marks.body.data.some(
            (item: any) =>
              item.questionId === questionIds[0] &&
              item.bank.id === questionBankId,
          ),
          'A student must be able to retrieve their accessible marked-question list',
        );
        const unmarked = await student<any>(
          student1Token,
          'DELETE',
          `/student/assessments/question-marks/${questionIds[0]}`,
        );
        expectStatus(unmarked, 200);
        assert(
          unmarked.body.questionId === questionIds[0] &&
            unmarked.body.marked === false,
          'A student must be able to remove a question mark',
        );
        const createdNote = await student<any>(
          student1Token,
          'PUT',
          `/student/assessments/question-notes/${questionIds[0]}`,
          { body: 'Review the key definition' },
        );
        expectStatus(createdNote, 200);
        assert(
          createdNote.body.questionId === questionIds[0] &&
            createdNote.body.body === 'Review the key definition',
          'A student must be able to add a private note to an accessible question',
        );
        const updatedNote = await student<any>(
          student1Token,
          'PUT',
          `/student/assessments/question-notes/${questionIds[0]}`,
          { body: 'Review the updated definition' },
        );
        expectStatus(updatedNote, 200);
        assert(
          updatedNote.body.body === 'Review the updated definition',
          'A student must be able to update their private question note',
        );
        const deletedNote = await student<any>(
          student1Token,
          'DELETE',
          `/student/assessments/question-notes/${questionIds[0]}`,
        );
        expectStatus(deletedNote, 200);
        assert(
          deletedNote.body.questionId === questionIds[0] &&
            deletedNote.body.deleted === true,
          'A student must be able to delete their private question note',
        );
        const report = await student<any>(
          student1Token,
          'POST',
          `/student/questions/${questionIds[0]}/reports`,
          { type: 'TYPO_LANGUAGE' },
        );
        expectStatus(report, 201);
        const reports = await admin.request<any>(
          'GET',
          '/admin/question-reports?status=OPEN',
        );
        expectStatus(reports, 200);
        assert(
          reports.body.data.some((item: any) => item.id === report.body.id),
          'Admins must be able to moderate student question reports',
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/question-reports/${report.body.id}/review`,
            { status: 'RESOLVED', note: 'Reviewed and corrected.' },
          ),
          201,
        );
        const legacyReport = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/question-reports/${questionIds[1]}`,
          { type: 'UNCLEAR_WORDING', note: 'The wording needs review.' },
        );
        expectStatus(legacyReport, 201);
        const legacyReports = await admin.request<any>(
          'GET',
          '/admin/assessments/question-reports?status=OPEN',
        );
        expectStatus(legacyReports, 200);
        assert(
          legacyReports.body.data.some(
            (item: any) => item.id === legacyReport.body.id,
          ),
          'The compatibility report list must include an open legacy report',
        );
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/assessments/question-reports/${legacyReport.body.id}/review`,
            { status: 'RESOLVED', note: 'Wording review complete.' },
          ),
          201,
        );
        const allBanksGenerated = await student<any>(
          student1Token,
          'POST',
          '/student/assessments',
          {
            chapterIds: [chapterId],
            sourceIds: [questionSourceId],
            questionCount: 1,
          },
        );
        expectStatus(allBanksGenerated, 201);
        assert(
          Array.isArray(allBanksGenerated.body.questionBankIds) &&
            allBanksGenerated.body.questionBankIds.length === 0,
          'Omitting questionBankIds must create an assessment from all eligible banks without persisting a bank restriction',
        );
        const generated = await student<any>(
          student1Token,
          'POST',
          '/student/assessments',
          {
            questionBankIds: [questionBankId, secondQuestionBankId],
            chapterIds: [chapterId],
            sourceIds: [questionSourceId],
            questionCount: 2,
            mode: 'EXAM',
          },
        );
        expectStatus(generated, 201);
        assert(
          generated.body.questionCount === 2 &&
            generated.body.visibility === 'MINE' &&
            generated.body.questionBankIds.includes(questionBankId) &&
            generated.body.questionBankIds.includes(secondQuestionBankId),
          'A generated assessment must reflect the requested question count, selected bank set, and owner',
        );
        const legacy = await student<any>(
          student1Token,
          'POST',
          '/student/assessments',
          { scopes: [{ chapterId }], questionCount: 1 },
        );
        expectStatus(legacy, 400);
        studentAssessmentId = generated.body.id;

        const ownList = await student<any>(
          student1Token,
          'GET',
          '/student/assessments',
        );
        expectStatus(ownList, 200);
        assert(
          ownList.body.data.some(
            (x: any) =>
              x.id === studentAssessmentId && x.attemptStatus === 'NOT_STARTED',
          ),
          "The owner's list must include a generated assessment as NOT_STARTED",
        );
        const notStarted = await student<any>(
          student1Token,
          'GET',
          '/student/assessments?status=NOT_STARTED',
        );
        expectStatus(notStarted, 200);
        assert(
          notStarted.body.data?.some(
            (x: any) =>
              x.id === studentAssessmentId && x.attemptStatus === 'NOT_STARTED',
          ),
          'The NOT_STARTED filter must include assessments without an attempt record',
        );

        const otherList = await student<any>(
          student2Token,
          'GET',
          '/student/assessments',
        );
        expectStatus(otherList, 200);
        assert(
          !otherList.body.data.some((x: any) => x.id === studentAssessmentId),
          "A student-owned assessment must never appear in another student's list",
        );

        const forbidden = await student<any>(
          student2Token,
          'GET',
          `/student/assessments/${studentAssessmentId}`,
        );
        expectStatus(forbidden, 403);
        const detail = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${studentAssessmentId}`,
        );
        expectStatus(detail, 200);
        const renamed = await student<any>(
          student1Token,
          'PATCH',
          `/student/assessments/${studentAssessmentId}`,
          { title: factory.title('Renamed student assessment') },
        );
        expectStatus(renamed, 200);
        assert(
          renamed.body.id === studentAssessmentId,
          'An owner must be able to rename their assessment',
        );
      },
    );

    await step(
      'Running the full attempt lifecycle for the private assessment',
      async () => {
        const start = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${studentAssessmentId}/attempts/start`,
        );
        expectStatus(start, 201);
        assert(
          start.body.status === 'SUSPENDED' &&
            start.body.questions.length === 2,
          'A fresh attempt must start suspended with every snapshot question',
        );
        const suspended = await student<any>(
          student1Token,
          'GET',
          '/student/assessments?status=SUSPENDED',
        );
        expectStatus(suspended, 200);
        assert(
          suspended.body.data?.some(
            (item: any) =>
              item.id === studentAssessmentId &&
              item.attemptStatus === 'SUSPENDED',
          ),
          'The suspended filter must preserve existing attempt status behavior',
        );
        const firstQuestion = start.body.questions[0];
        const noteOnSnapshot = await student<any>(
          student1Token,
          'PUT',
          `/student/assessments/question-notes/${firstQuestion.id}`,
          { body: 'Remember this assessment question' },
        );
        expectStatus(noteOnSnapshot, 200);

        const autosave = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${studentAssessmentId}/attempts/current/answers/${firstQuestion.id}`,
          { selectedOptionIds: [firstQuestion.options[0].id] },
        );
        expectStatus(autosave, 201);
        assert(
          autosave.body.isCorrect === null,
          'EXAM mode must not reveal correctness before submission',
        );

        const current = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${studentAssessmentId}/attempts/current`,
        );
        expectStatus(current, 200);
        assert(
          current.body.questions.find((q: any) => q.id === firstQuestion.id)
            ?.answered === true &&
            current.body.questions.find((q: any) => q.id === firstQuestion.id)
              ?.note === 'Remember this assessment question',
          'Autosaved answers and private notes must be reflected when resuming an attempt',
        );

        const activeTime = await student<any>(
          student1Token,
          'PATCH',
          `/student/assessments/${studentAssessmentId}/attempts/current/questions/${firstQuestion.id}/active-time`,
          { activeSeconds: 18 },
        );
        expectStatus(activeTime, 200);
        assert(
          activeTime.body.activeSeconds === 18,
          'A resumable attempt must retain monotonic active time per question',
        );

        const submit = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${studentAssessmentId}/attempts/current/submit`,
        );
        expectStatus(submit, 201);
        assert(
          submit.body.status === 'COMPLETED',
          'Submission must finalize the attempt',
        );
        const completed = await student<any>(
          student1Token,
          'GET',
          '/student/assessments?status=COMPLETED',
        );
        expectStatus(completed, 200);
        assert(
          completed.body.data?.some(
            (item: any) =>
              item.id === studentAssessmentId &&
              item.attemptStatus === 'COMPLETED',
          ),
          'The completed filter must preserve existing attempt status behavior',
        );

        const result = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${studentAssessmentId}/attempts/current/result`,
        );
        expectStatus(result, 200);
        assert(
          result.body.totalQuestions === 2 &&
            typeof result.body.questions[0].explanation === 'string',
          'The result must include the full explanation review after submission',
        );
        assert(
          result.body.questions.some(
            (question: any) => question.outcome === 'OMITTED',
          ) &&
            result.body.questions.some(
              (question: any) => question.outcome === 'CORRECT',
            ),
          'Assessment results must explicitly distinguish correct and omitted outcomes',
        );
        assert(
          result.body.percentage === 50 &&
            result.body.correctCount === 1 &&
            result.body.omittedCount === 1 &&
            result.body.questions[0].activeSeconds === 18,
          'Completed results must expose persisted summary counts and question active time',
        );
        assert(
          result.body.comparison?.status === 'INSUFFICIENT_DATA' &&
            result.body.comparison?.chapters?.some(
              (chapter: any) => chapter.chapterId === chapterId,
            ),
          'Comparison must derive chapter breakdowns from frozen question placements',
        );

        const withoutComparison = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${studentAssessmentId}/attempts/current/result?includeComparison=false`,
        );
        expectStatus(withoutComparison, 200);
        assert(
          withoutComparison.body.comparison === undefined,
          'includeComparison=false must omit the peer benchmark',
        );

        const analytics = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/analytics/summary?subjectId=${subjectId}`,
        );
        expectStatus(analytics, 200);
        assert(
          analytics.body.level === 'chapter' &&
            analytics.body.data.some(
              (chapter: any) => chapter.id === chapterId && chapter.total === 2,
            ),
          'Assessment analytics must aggregate completed outcomes by chapter',
        );
      },
    );

    await step(
      'Ranking community errors and generating AI and tutor assessments',
      async () => {
        const practice = await student<any>(
          student1Token,
          'GET',
          `/student/practice/questions?courseId=${courseId}`,
        );
        expectStatus(practice, 200);
        const rankedQuestion = practice.body.data.find(
          (question: any) => question.id === questionIds[0],
        );
        const wrongOption = rankedQuestion?.options?.find(
          (option: any) => option.body === 'Wrong',
        );
        assert(
          typeof wrongOption?.id === 'string',
          'The ranked-question fixture must expose a selectable wrong option',
        );
        for (let attempt = 0; attempt < 20; attempt += 1) {
          expectStatus(
            await student<any>(
              student1Token,
              'POST',
              `/student/practice/questions/${questionIds[0]}/attempts`,
              { optionIds: [wrongOption.id] },
            ),
            201,
          );
        }
        const community = await student<any>(
          student1Token,
          'GET',
          `/student/questions/community-most-incorrect?subjectId=${subjectId}&courseId=${courseId}`,
        );
        expectStatus(community, 200);
        const ranked = community.body.data.find(
          (item: any) => item.questionId === questionIds[0],
        );
        assert(
          ranked?.totalResponses >= 20 &&
            ranked?.incorrectResponses >= 20 &&
            !JSON.stringify(ranked).includes('options'),
          'Community ranking must expose answer-safe cards after its minimum sample threshold',
        );
        const legacyCommunity = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/community-most-incorrect?subjectId=${subjectId}&courseId=${courseId}`,
        );
        expectStatus(legacyCommunity, 200);
        const tutor = await student<any>(
          student1Token,
          'POST',
          '/student/assessments/community-tutor',
          {
            questionIds: [questionIds[0]],
            scopes: [{ courseId }],
            title: factory.title('Community tutor quiz'),
          },
        );
        expectStatus(tutor, 201);
        assert(
          tutor.body.mode === 'TUTOR' && tutor.body.questionCount === 1,
          'A tutor quiz must freeze the student-selected ranked question',
        );
        context.created.assessments.push(tutor.body.id);
        const aiPrompt = await student<any>(
          student1Token,
          'POST',
          '/student/assessments/ai-prompt',
          {
            prompt: 'Give me one focused practice question about this course.',
            questionCount: 1,
            mode: 'TUTOR',
            scopes: [{ courseId }],
          },
        );
        expectStatus(aiPrompt, 201);
        assert(
          aiPrompt.body.generationType === 'AI_PROMPT' &&
            aiPrompt.body.visibility === 'MINE' &&
            aiPrompt.body.questionCount === 1,
          'An AI prompt must produce a private frozen assessment from eligible questions',
        );
        context.created.assessments.push(aiPrompt.body.id);
      },
    );

    await step(
      'Delivering written responses through autosave, submission, and AI grading',
      async () => {
        const short = await create('/admin/questions', {
          bankId: questionBankId,
          sourceId: questionSourceId,
          courseId,
          placements: [{ chapterId }],
          type: 'SHORT_ANSWER',
          body: 'Write the normalized assessment keyword.',
          explanation: 'The accepted answer is synthetic.',
          acceptedAnswers: ['synthetic'],
          answerOrigin: 'HUMAN_REVIEWED',
          maxPoints: 2,
        });
        const long = await create('/admin/questions', {
          bankId: questionBankId,
          sourceId: questionSourceId,
          courseId,
          placements: [{ chapterId }],
          type: 'LONG_ANSWER',
          body: 'Explain the synthetic concept in one sentence.',
          explanation: 'A reviewer will assess the explanation.',
          gradingRubric:
            'Award one point for the concept and one for a clear explanation.',
          answerOrigin: 'HUMAN_REVIEWED',
          maxPoints: 2,
        });
        const fill = await create('/admin/questions', {
          bankId: questionBankId,
          sourceId: questionSourceId,
          courseId,
          placements: [{ chapterId }],
          type: 'FILL_IN_THE_BLANK',
          body: 'Complete the keyword: synt_____.',
          explanation: 'The accepted answer is synthetic.',
          acceptedAnswers: ['synthetic'],
          answerOrigin: 'HUMAN_REVIEWED',
          maxPoints: 2,
        });
        for (const question of [short, fill, long]) {
          expectStatus(
            await admin.request<any>(
              'POST',
              `/admin/questions/${question.id}/submit`,
            ),
            201,
          );
          expectStatus(
            await admin.request<any>(
              'POST',
              `/admin/questions/${question.id}/publish`,
            ),
            201,
          );
          context.created.questions.push(question.id);
        }
        writtenShortQuestionId = short.id;
        const assessment = await admin.request<any>(
          'POST',
          '/admin/assessments/custom',
          {
            questionIds: [short.id, fill.id, long.id],
            scopes: [{ courseId }],
            mode: 'EXAM',
            title: factory.title('Written response assessment'),
          },
        );
        expectStatus(assessment, 201);
        writtenAssessmentId = assessment.body.id;
        context.created.assessments.push(writtenAssessmentId);
        expectStatus(
          await admin.request<any>(
            'POST',
            `/admin/assessments/${writtenAssessmentId}/publish`,
          ),
          201,
        );

        const started = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${writtenAssessmentId}/attempts/start`,
        );
        expectStatus(started, 201);
        const shortSnapshot = started.body.questions.find(
          (question: any) => question.type === 'SHORT_ANSWER',
        );
        const longSnapshot = started.body.questions.find(
          (question: any) => question.type === 'LONG_ANSWER',
        );
        const fillSnapshot = started.body.questions.find(
          (question: any) => question.type === 'FILL_IN_THE_BLANK',
        );
        assert(
          shortSnapshot &&
            fillSnapshot &&
            longSnapshot &&
            shortSnapshot.acceptedAnswers === undefined &&
            fillSnapshot.acceptedAnswers === undefined &&
            longSnapshot.gradingRubric === undefined,
          'Student assessment delivery must not expose written answer keys or rubrics',
        );
        const shortSaved = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${writtenAssessmentId}/attempts/current/answers/${shortSnapshot.id}`,
          { responseText: ' SYNTHETIC ' },
        );
        expectStatus(shortSaved, 201);
        const fillSaved = await student<any>(
          student1Token,
          'POST',
          `/student/assessments/${writtenAssessmentId}/attempts/current/answers/${fillSnapshot.id}`,
          { responseText: 'synthetic' },
        );
        expectStatus(fillSaved, 201);
        assert(
          shortSaved.body.outcome === 'PENDING_AI_GRADING' &&
            fillSaved.body.outcome === 'PENDING_AI_GRADING' &&
            shortSaved.body.isCorrect === null,
          'Submit-time written autosaves must not invoke AI or reveal a grade',
        );
        expectStatus(
          await student<any>(
            student1Token,
            'POST',
            `/student/assessments/${writtenAssessmentId}/attempts/current/answers/${longSnapshot.id}`,
            {
              responseText: 'A clear synthetic explanation.',
              inputMethod: 'VOICE_TRANSCRIPT',
              responseLanguageCode: 'en',
              transcriptionProvider: 'openrouter',
              transcriptionConfidence: 1,
            },
          ),
          201,
        );
        const resumed = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${writtenAssessmentId}/attempts/current`,
        );
        expectStatus(resumed, 200);
        assert(
          resumed.body.questions.find(
            (question: any) => question.id === longSnapshot.id,
          )?.responseText === 'A clear synthetic explanation.',
          'Written autosaves must be available when an attempt is resumed',
        );
        expectStatus(
          await student<any>(
            student1Token,
            'POST',
            `/student/assessments/${writtenAssessmentId}/attempts/current/submit`,
          ),
          201,
        );
        const result = await student<any>(
          student1Token,
          'GET',
          `/student/assessments/${writtenAssessmentId}/attempts/current/result`,
        );
        expectStatus(result, 200);
        const longResult = result.body.questions.find(
          (question: any) => question.id === longSnapshot.id,
        );
        const shortResult = result.body.questions.find(
          (question: any) => question.id === shortSnapshot.id,
        );
        const fillResult = result.body.questions.find(
          (question: any) => question.id === fillSnapshot.id,
        );
        assert(
          result.body.totalPoints === 6 &&
            longResult?.inputMethod === 'VOICE_TRANSCRIPT' &&
            [shortResult, fillResult, longResult].every((item) =>
              [
                'CORRECT',
                'PARTIALLY_CORRECT',
                'INCORRECT',
                'PENDING_AI_GRADING',
              ].includes(item?.outcome),
            ),
          'All written types must be separately AI graded after submission and retain transcript provenance',
        );
        assert(
          [shortResult, fillResult, longResult].every((item) => {
            const run = item?.aiGrading;
            if (run?.status === 'COMPLETED')
              return (
                ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'].includes(
                  item.outcome,
                ) &&
                typeof item.awardedPoints === 'number' &&
                typeof item.graderFeedback === 'string'
              );
            return (
              item?.outcome === 'PENDING_AI_GRADING' &&
              run?.status === 'FAILED' &&
              run?.error === 'PENDING_RETRY'
            );
          }),
          'Every submitted written response must retain a completed grade or a retryable failed AI run',
        );
        if (longResult?.outcome === 'PENDING_AI_GRADING') {
          assert(
            result.body.pendingAiGradingCount >= 1,
            'Failed AI grading must remain retryable',
          );
          const pending = await admin.request<any>(
            'GET',
            '/admin/assessments/grading/pending',
          );
          expectStatus(pending, 200);
          const pendingAnswer = pending.body.find(
            (answer: any) => answer.assessmentQuestionId === longSnapshot.id,
          );
          assert(
            pendingAnswer?.gradingRubric === undefined &&
              pendingAnswer?.assessmentQuestion?.gradingRubric,
            'The AI retry queue must retain the frozen rubric without returning it to students',
          );
          expectStatus(
            await admin.request<any>(
              'POST',
              `/admin/assessments/grading/answers/${pendingAnswer.id}/retry-ai`,
            ),
            201,
          );
        } else {
          assert(
            ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'].includes(
              longResult?.outcome,
            ) &&
              longResult?.aiGrading?.status === 'COMPLETED' &&
              typeof longResult?.graderFeedback === 'string',
            'Configured AI grading must return a scored long answer with feedback',
          );
        }
      },
    );

    await step('Rejecting an essay without an AI rubric', async () => {
      const manualQuestion = await create('/admin/questions', {
        bankId: questionBankId,
        sourceId: questionSourceId,
        courseId,
        placements: [{ chapterId }],
        type: 'LONG_ANSWER',
        body: 'Describe the synthetic concept without a rubric.',
        explanation: 'Long-answer questions require an AI grading rubric.',
        answerOrigin: 'HUMAN_REVIEWED',
        maxPoints: 2,
      });
      expectStatus(
        await admin.request<any>(
          'POST',
          `/admin/questions/${manualQuestion.id}/submit`,
        ),
        409,
      );
    });

    await step(
      'Building an admin quiz from hand-picked questions and publishing it',
      async () => {
        const standard = await admin.request<any>(
          'POST',
          '/admin/assessments/standard',
          {
            scopes: [{ courseId }],
            questionCount: 2,
            mode: 'EXAM',
            title: factory.title('Disposable standard assessment'),
          },
        );
        expectStatus(standard, 201);
        const adminList = await admin.request<any>(
          'GET',
          '/admin/assessments?search=Disposable',
        );
        expectStatus(adminList, 200);
        assert(
          adminList.body.data.some(
            (item: any) => item.id === standard.body.id,
          ) && adminList.body.meta.total >= 1,
          'Admin assessment lists must include draft assessments',
        );
        const adminDetail = await admin.request<any>(
          'GET',
          `/admin/assessments/${standard.body.id}`,
        );
        expectStatus(adminDetail, 200);
        const updated = await admin.request<any>(
          'PATCH',
          `/admin/assessments/${standard.body.id}`,
          { title: factory.title('Updated standard assessment') },
        );
        expectStatus(updated, 200);
        const deleted = await admin.request<any>(
          'DELETE',
          `/admin/assessments/${standard.body.id}`,
        );
        expectStatus(deleted, 200);
        assert(
          deleted.body.deleted === true,
          'A never-published admin assessment must be deletable',
        );

        const created = await admin.request<any>(
          'POST',
          '/admin/assessments/custom',
          {
            questionIds: [questionIds[0], writtenShortQuestionId],
            scopes: [{ courseId }],
            mode: 'TUTOR',
          },
        );
        expectStatus(created, 201);
        assert(
          created.body.status === 'DRAFT',
          'A newly built admin assessment must start as DRAFT',
        );
        adminAssessmentId = created.body.id;
        context.created.assessments.push(adminAssessmentId);

        const notYetVisible = await student<any>(
          student2Token,
          'GET',
          '/student/assessments',
        );
        expectStatus(notYetVisible, 200);
        assert(
          !notYetVisible.body.data.some((x: any) => x.id === adminAssessmentId),
          'A draft admin assessment must not be visible to students before publishing',
        );

        const published = await admin.request<any>(
          'POST',
          `/admin/assessments/${adminAssessmentId}/publish`,
        );
        expectStatus(published, 201);
        assert(
          published.body.status === 'READY',
          'Publishing must move the assessment to READY',
        );
      },
    );

    await step(
      'Making the published admin assessment public and attemptable by any entitled student',
      async () => {
        for (const token of [student1Token, student2Token]) {
          const list = await student<any>(token, 'GET', '/student/assessments');
          expectStatus(list, 200);
          const row = list.body.data.find(
            (x: any) => x.id === adminAssessmentId,
          );
          assert(
            row?.visibility === 'PUBLIC',
            'A published admin assessment must be visible to any student entitled to its scope',
          );
        }
        const start = await student<any>(
          student2Token,
          'POST',
          `/student/assessments/${adminAssessmentId}/attempts/start`,
        );
        expectStatus(start, 201);
        const choiceQuestion = start.body.questions.find(
          (question: any) => question.type === 'SINGLE_CHOICE',
        );
        const writtenQuestion = start.body.questions.find(
          (question: any) => question.type === 'SHORT_ANSWER',
        );
        assert(
          choiceQuestion && writtenQuestion,
          'The tutor assessment must include both choice and written snapshots',
        );
        const autosave = await student<any>(
          student2Token,
          'POST',
          `/student/assessments/${adminAssessmentId}/attempts/current/answers/${choiceQuestion.id}`,
          { selectedOptionIds: [choiceQuestion.options[0].id] },
        );
        expectStatus(autosave, 201);
        assert(
          autosave.body.isCorrect !== null,
          'TUTOR mode must reveal correctness immediately after an answer is saved',
        );
        const writtenAutosave = await student<any>(
          student2Token,
          'POST',
          `/student/assessments/${adminAssessmentId}/attempts/current/answers/${writtenQuestion.id}`,
          { responseText: 'synthetic' },
        );
        expectStatus(writtenAutosave, 201);
        assert(
          (writtenAutosave.body.aiGrading?.status === 'COMPLETED' &&
            ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'].includes(
              writtenAutosave.body.outcome,
            ) &&
            typeof writtenAutosave.body.awardedPoints === 'number' &&
            typeof writtenAutosave.body.graderFeedback === 'string') ||
            (writtenAutosave.body.aiGrading?.status === 'FAILED' &&
              writtenAutosave.body.outcome === 'PENDING_AI_GRADING' &&
              writtenAutosave.body.aiGrading.error === 'PENDING_RETRY'),
          'A tutor written autosave must return immediate safe AI feedback or a retryable failure state',
        );
        expectStatus(
          await student<any>(
            student2Token,
            'POST',
            `/student/assessments/${adminAssessmentId}/attempts/current/submit`,
          ),
          201,
        );
      },
    );

    await step(
      'Archiving the admin assessment removes it from student lists',
      async () => {
        const archived = await admin.request<any>(
          'POST',
          `/admin/assessments/${adminAssessmentId}/archive`,
        );
        expectStatus(archived, 201);
        assert(
          archived.body.status === 'ARCHIVED',
          'Archiving must move the assessment to ARCHIVED',
        );
        const list = await student<any>(
          student1Token,
          'GET',
          '/student/assessments',
        );
        expectStatus(list, 200);
        assert(
          !list.body.data.some((x: any) => x.id === adminAssessmentId),
          'An archived admin assessment must no longer be listed for students',
        );
        const deleted = await student<any>(
          student1Token,
          'DELETE',
          `/student/assessments/${studentAssessmentId}`,
        );
        expectStatus(deleted, 200);
        assert(
          deleted.body.deleted === true,
          'A student must be able to delete their private assessment',
        );
      },
    );
  },
};
