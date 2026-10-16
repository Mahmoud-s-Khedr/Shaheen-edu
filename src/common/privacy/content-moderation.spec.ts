import { AssessmentsService } from '../../modules/assessments/assessments.service';
import { Role } from '../types/roles.enum';

const identity = {
  studentUserId: 'secret-student',
  student: {
    fullName: 'Secret Name',
    user: { loginIdentifier: 'secret@example.com' },
  },
  user: { id: 'secret-account' },
};
const actor = (role: Role) => ({ id: 'staff', role, sessionId: 'session' });
function build() {
  const report = {
    ...identity,
    id: 'report',
    questionId: 'question',
    note: 'Please fix',
    status: 'OPEN',
    question: { ...identity, id: 'question', body: 'Question' },
    questionSnapshot: { ...identity, id: 'question', body: 'Question' },
  };
  const answer = {
    ...identity,
    id: 'answer',
    attemptId: 'attempt',
    assessmentQuestionId: 'snapshot',
    outcome: 'PENDING_AI_GRADING',
    responseText: 'My answer',
    awardedPoints: 2,
    attempt: {
      ...identity,
      id: 'attempt',
      assessment: { ...identity, id: 'assessment', title: 'Exam' },
    },
    assessmentQuestion: {
      ...identity,
      id: 'snapshot',
      body: 'Question',
      type: 'LONG_ANSWER',
      gradingRubric: 'Rubric',
    },
    aiGradingRuns: [
      {
        ...identity,
        id: 'run',
        status: 'FAILED',
        rawResponse: identity,
        feedback: 'Retry',
      },
    ],
  };
  const prisma: any = {
    questionReport: {
      findMany: jest.fn().mockResolvedValue([report]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn().mockResolvedValue(report),
      update: jest.fn().mockResolvedValue(report),
    },
    questionReportAction: { create: jest.fn() },
    assessmentAttemptAnswer: {
      findMany: jest.fn().mockResolvedValue([answer]),
      findUnique: jest.fn().mockResolvedValue(answer),
      findUniqueOrThrow: jest.fn().mockResolvedValue(answer),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  };
  const service: any = Object.create(AssessmentsService.prototype);
  service.prisma = prisma;
  service.audit = { record: jest.fn() };
  service.gradePendingAiAnswers = jest.fn();
  service.aiGradingEligible = jest.fn().mockReturnValue(true);
  return { service, prisma, report, answer };
}

describe('Moderation and grading identity boundaries', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])(
    'projects lists and mutation results for %s',
    async (role) => {
      const { service, report, answer } = build();
      const reports = await service.listQuestionReports(actor(role), {
        page: 1,
        limit: 20,
      });
      const reviewed = await service.reviewQuestionReport(
        actor(role),
        'report',
        { status: 'UNDER_REVIEW' },
      );
      const pending = await service.pendingAiGrades(actor(role));
      const retried = await service.retryAiGrade(actor(role), 'answer');
      expect(reports.data[0]).toMatchObject({
        id: 'report',
        note: 'Please fix',
        questionId: 'question',
      });
      expect(pending[0]).toMatchObject({
        id: 'answer',
        responseText: 'My answer',
        awardedPoints: 2,
        attempt: { assessment: { title: 'Exam' } },
        aiGradingRuns: [{ id: 'run', status: 'FAILED' }],
      });
      if (role === Role.ADMIN) {
        for (const response of [reports, reviewed, pending, retried])
          expect(JSON.stringify(response)).not.toMatch(
            /secret|student|loginIdentifier|fullName|rawResponse/i,
          );
      } else {
        expect(reports.data[0]).toEqual(report);
        expect(reviewed).toEqual(report);
        expect(retried).toEqual(answer);
        expect(pending[0].studentUserId).toBe('secret-student');
      }
    },
  );

  it('normalizes structured explanations identically for both roles', async () => {
    const pendingFor = async (role: Role) => {
      const { service, answer } = build();
      answer.assessmentQuestion = {
        ...answer.assessmentQuestion,
        structuredExplanationFormat: null,
        structuredExplanation: { summary: 'Why' },
      } as any;
      return (await service.pendingAiGrades(actor(role)))[0].assessmentQuestion;
    };
    const admin = await pendingFor(Role.ADMIN);
    const superAdmin = await pendingFor(Role.SUPER_ADMIN);
    expect(admin.structuredExplanationFormat).not.toBeNull();
    expect(admin.structuredExplanationFormat).toBe(
      superAdmin.structuredExplanationFormat,
    );
    expect(admin.structuredExplanation).toEqual(
      superAdmin.structuredExplanation,
    );
  });
});
