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
    let questionBankId = '';
    let questionSourceId = '';
    let questionIds: string[] = [];
    let student1Token = '';
    let student2Token = '';
    let studentAssessmentId = '';
    let adminAssessmentId = '';
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
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

        for (let i = 0; i < 3; i++) {
          const question = await create('/admin/questions', {
            bankId: bank.id,
            sourceId: source.id,
            courseId,
            placements: [{ courseId }],
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
      'Discovering a bank and generating a filtered private standard assessment',
      async () => {
        const banks = await student<any>(student1Token, 'GET', `/student/assessments/question-banks?subjectId=${subjectId}`);
        expectStatus(banks, 200);
        assert(banks.body.data.some((item: any) => item.id === questionBankId && item.availableQuestionCount === 3), 'A student must discover only an accessible bank with its available count');
        const sources = await student<any>(student1Token, 'GET', `/student/assessments/question-sources?questionBankId=${questionBankId}`);
        expectStatus(sources, 200);
        assert(sources.body.data.some((item: any) => item.id === questionSourceId && item.type === 'PLATFORM'), 'A bank source list must be learner-safe and accessible');
        expectStatus(await student<any>(student1Token, 'POST', `/student/assessments/question-marks/${questionIds[0]}`), 201);
        const marks = await student<any>(student1Token, 'GET', '/student/assessments/question-marks');
        expectStatus(marks, 200);
        assert(marks.body.data.some((item: any) => item.questionId === questionIds[0] && item.bank.id === questionBankId), 'A student must be able to retrieve their accessible marked-question list');
        const generated = await student<any>(
          student1Token,
          'POST',
          '/student/assessments',
          { questionBankId, courseIds: [courseId], sourceIds: [questionSourceId], questionCount: 2, mode: 'EXAM' },
        );
        expectStatus(generated, 201);
        assert(
          generated.body.questionCount === 2 &&
            generated.body.visibility === 'MINE' && generated.body.questionBankId === questionBankId,
          'A generated assessment must reflect the requested question count and be owned by the requester',
        );
        studentAssessmentId = generated.body.id;

        const ownList = await student<any>(
          student1Token,
          'GET',
          '/student/assessments',
        );
        expectStatus(ownList, 200);
        assert(
          ownList.body.data.some((x: any) => x.id === studentAssessmentId),
          "The owner's list must include their own generated assessment",
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
        const firstQuestion = start.body.questions[0];

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
            ?.answered === true,
          'Autosaved answers must be reflected when resuming an attempt',
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
        assert(result.body.questions.some((question: any) => question.outcome === 'OMITTED') && result.body.questions.some((question: any) => question.outcome === 'CORRECT'), 'Assessment results must explicitly distinguish correct and omitted outcomes');
      },
    );

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
        const adminList = await admin.request<any>('GET', '/admin/assessments?search=Disposable');
        expectStatus(adminList, 200);
        assert(
          adminList.body.data.some((item: any) => item.id === standard.body.id) && adminList.body.meta.total >= 1,
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
            questionIds: [questionIds[0], questionIds[1]],
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
        const question = start.body.questions[0];
        const autosave = await student<any>(
          student2Token,
          'POST',
          `/student/assessments/${adminAssessmentId}/attempts/current/answers/${question.id}`,
          { selectedOptionIds: [question.options[0].id] },
        );
        expectStatus(autosave, 201);
        assert(
          autosave.body.isCorrect !== null,
          'TUTOR mode must reveal correctness immediately after an answer is saved',
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
