import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  AssessmentAttemptStatus,
  AssessmentMode,
  AssessmentOwnerType,
  AssessmentStatus,
  ContentStatus,
  QuestionType,
  Role,
} from '../../common/types/roles.enum';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsService', () => {
  const studentUserId = 'student-1';

  function build() {
    const prisma: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: { findUnique: jest.fn() },
      chapter: { findUnique: jest.fn() },
      lesson: { findUnique: jest.fn() },
      section: { findUnique: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([]) },
      questionSource: { findUnique: jest.fn().mockResolvedValue(null) },
      questionBank: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      studentEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
      assessment: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      assessmentQuestion: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      asset: { findUnique: jest.fn() },
      assessmentAttempt: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      assessmentAttemptAnswer: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'answer-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { awardedPoints: 0 } }),
      },
      assessmentAnswerAiGradingRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'ai-run-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      studentQuestionMark: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentQuestionNote: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      assessmentAnswerChange: { create: jest.fn() },
      questionCommunityStat: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (arg: any) =>
        Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const communityStats = {
      recordResponse: jest.fn().mockResolvedValue(undefined),
    };
    const access = new ContentAccessPolicyService(prisma);
    const config = { get: jest.fn().mockReturnValue(10) };
    const assets = { getReady: jest.fn(), protectedAccess: jest.fn() };
    const videos = { playback: jest.fn() };
    const ai = { planQuiz: jest.fn(), gradeAnswer: jest.fn() };
    return {
      service: new AssessmentsService(
        prisma,
        audit as any,
        access,
        communityStats,
        config as any,
        assets as any,
        videos as any,
        ai as any,
      ),
      prisma,
      communityStats,
      assets,
      videos,
      ai,
    };
  }

  it('renders NOT_STARTED when no assessment attempt exists', () => {
    const { service } = build();
    expect(
      (service as any).listItemDto(
        {
          id: 'assessment-1',
          title: 'Assessment',
          generationType: 'STANDARD',
          mode: 'EXAM',
          isTimed: false,
          durationSeconds: null,
          questionCount: 1,
          createdAt: new Date(),
        },
        'PUBLIC',
      ),
    ).toMatchObject({
      attemptStatus: 'NOT_STARTED',
      score: null,
      percentage: null,
    });
  });

  it('renders a completed assessment score with its percentage', () => {
    const { service } = build();
    expect(
      (service as any).listItemDto(
        {
          id: 'assessment-1',
          title: 'Assessment',
          generationType: 'STANDARD',
          mode: 'EXAM',
          isTimed: false,
          durationSeconds: null,
          questionCount: 1,
          createdAt: new Date(),
        },
        'MINE',
        {
          status: AssessmentAttemptStatus.COMPLETED,
          score: 3,
          totalPoints: 4,
        },
      ),
    ).toMatchObject({ score: 3, percentage: 75 });
  });

  it('filters visible assessments with no attempt as NOT_STARTED', async () => {
    const { service, prisma } = build();
    prisma.assessment.findMany
      .mockResolvedValueOnce([
        {
          id: 'assessment-1',
          title: 'Assessment',
          generationType: 'STANDARD',
          mode: 'EXAM',
          isTimed: false,
          durationSeconds: null,
          questionCount: 1,
          createdAt: new Date(),
          ownerType: AssessmentOwnerType.STUDENT,
          studentUserId,
        },
      ])
      .mockResolvedValueOnce([]);
    await expect(
      service.list(studentUserId, {
        page: 1,
        limit: 20,
        status: 'NOT_STARTED',
      } as any),
    ).resolves.toMatchObject({
      data: [{ id: 'assessment-1', attemptStatus: 'NOT_STARTED' }],
      meta: { total: 1 },
    });
  });

  describe('scope resolution', () => {
    it('rejects a scope with zero targets', async () => {
      const { service } = build();
      await expect((service as any).resolveScopes([{}])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a scope with more than one target', async () => {
      const { service } = build();
      await expect(
        (service as any).resolveScopes([{ courseId: 'c1', chapterId: 'ch1' }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate scopes', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
      });
      await expect(
        (service as any).resolveScopes([
          { courseId: 'c1' },
          { courseId: 'c1' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a scope target that does not exist', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(
        (service as any).resolveScopes([{ courseId: 'missing' }]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('placementInScope', () => {
    it('matches a course scope against a placement nested under a chapter', () => {
      const { service } = build();
      const matches = (service as any).placementInScope(
        { chapter: { courseId: 'c1' } },
        { courseId: 'c1' },
      );
      expect(matches).toBe(true);
    });

    it('does not match an unrelated course scope', () => {
      const { service } = build();
      const matches = (service as any).placementInScope(
        { chapter: { courseId: 'c1' } },
        { courseId: 'c2' },
      );
      expect(matches).toBe(false);
    });
  });

  describe('placementPublished', () => {
    it('rejects a placement whose chapter ancestor is a draft, even under a published course', () => {
      const { service } = build();
      const nodes = (service as any).placementNodes({
        chapter: {
          status: ContentStatus.DRAFT,
          course: { status: ContentStatus.PUBLISHED },
        },
      });
      expect((service as any).placementPublished(nodes)).toBe(false);
    });

    it('accepts a placement whose full ancestry is published', () => {
      const { service } = build();
      const nodes = (service as any).placementNodes({
        chapter: {
          status: ContentStatus.PUBLISHED,
          course: { status: ContentStatus.PUBLISHED },
        },
      });
      expect((service as any).placementPublished(nodes)).toBe(true);
    });
  });

  describe('questionAccessible', () => {
    it('grants access immediately for a PUBLIC course without an entitlement lookup', async () => {
      const { service, prisma } = build();
      const placements = [
        {
          course: {
            id: 'c1',
            status: ContentStatus.PUBLISHED,
            accessType: AccessType.PUBLIC,
          },
        },
      ];
      await expect(
        (service as any).questionAccessible(studentUserId, placements),
      ).resolves.toBe(true);
      expect(prisma.studentEntitlement.findFirst).not.toHaveBeenCalled();
    });

    it('requires an active entitlement for a PAID course', async () => {
      const { service, prisma } = build();
      const placements = [
        {
          course: {
            id: 'c1',
            status: ContentStatus.PUBLISHED,
            accessType: AccessType.PAID,
          },
        },
      ];
      prisma.studentEntitlement.findFirst.mockResolvedValue(null);
      await expect(
        (service as any).questionAccessible(studentUserId, placements),
      ).resolves.toBe(false);
      prisma.studentEntitlement.findFirst.mockResolvedValue({ id: 'ent-1' });
      await expect(
        (service as any).questionAccessible(studentUserId, placements),
      ).resolves.toBe(true);
    });
  });

  describe('assessmentVisible', () => {
    const gradeId = 'grade-1';
    function courseScope(overrides: Partial<any> = {}) {
      return {
        course: {
          id: 'c1',
          status: ContentStatus.PUBLISHED,
          accessType: AccessType.PUBLIC,
          subject: { academicGradeId: gradeId },
          ...overrides,
        },
      };
    }

    it('is visible when the course is PUBLIC and grade matches', async () => {
      const { service } = build();
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          courseScope(),
        ]),
      ).resolves.toBe(true);
    });

    it('is hidden when the scope belongs to a different grade', async () => {
      const { service } = build();
      await expect(
        (service as any).assessmentVisible(studentUserId, 'grade-2', [
          courseScope(),
        ]),
      ).resolves.toBe(false);
    });

    it('is visible when the student holds a matching entitlement for a PAID course', async () => {
      const { service, prisma } = build();
      prisma.studentEntitlement.findFirst.mockResolvedValue({ id: 'ent-1' });
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          courseScope({ accessType: AccessType.PAID }),
        ]),
      ).resolves.toBe(true);
    });

    it('is hidden when no scope has an active entitlement', async () => {
      const { service, prisma } = build();
      prisma.studentEntitlement.findFirst.mockResolvedValue(null);
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          courseScope({ accessType: AccessType.PAID }),
        ]),
      ).resolves.toBe(false);
    });

    function chapterScope(chapterId: string, overrides: Partial<any> = {}) {
      return {
        chapter: {
          id: chapterId,
          courseId: 'c1',
          status: ContentStatus.PUBLISHED,
          accessType: AccessType.PAID,
          course: {
            id: 'c1',
            status: ContentStatus.PUBLISHED,
            subject: { academicGradeId: gradeId },
          },
          ...overrides,
        },
      };
    }

    /** Mimics ContentAccessPolicyService.entitledForNodes's actual query shape
     * against a fixed set of `ownedChapterIds` the student holds a chapter-level
     * entitlement for, without hitting a real database. */
    function mockChapterEntitlements(prisma: any, ownedChapterIds: string[]) {
      prisma.studentEntitlement.findFirst.mockImplementation(
        async ({ where }: any) => {
          const chapterOr = where.AND[1].OR[1];
          const matches = (chapterOr.chapterId.in as string[]).some((id) =>
            ownedChapterIds.includes(id),
          );
          return matches ? { id: 'ent-1' } : null;
        },
      );
    }

    it('is hidden when the student is entitled to only one of two chapter scopes', async () => {
      const { service, prisma } = build();
      mockChapterEntitlements(prisma, ['chA']);
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          chapterScope('chA'),
          chapterScope('chB'),
        ]),
      ).resolves.toBe(false);
    });

    it('is visible when the student is entitled to every chapter scope', async () => {
      const { service, prisma } = build();
      mockChapterEntitlements(prisma, ['chA', 'chB']);
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          chapterScope('chA'),
          chapterScope('chB'),
        ]),
      ).resolves.toBe(true);
    });

    it('is hidden (fail-closed) when one of several scopes has an unpublished ancestor, even if another scope alone would pass', async () => {
      const { service, prisma } = build();
      mockChapterEntitlements(prisma, ['chA', 'chB']);
      await expect(
        (service as any).assessmentVisible(studentUserId, gradeId, [
          chapterScope('chA'),
          chapterScope('chB', { status: ContentStatus.DRAFT }),
        ]),
      ).resolves.toBe(false);
    });
  });

  describe('searchedAssessments', () => {
    it('hydrates every SQL search page instead of truncating after the first batch', async () => {
      const { service, prisma } = build();
      const ids = Array.from(
        { length: 501 },
        (_, index) => `assessment-${index + 1}`,
      );
      prisma.$queryRaw
        .mockResolvedValueOnce(
          ids.slice(0, 500).map((id) => ({ id, total: BigInt(501) })),
        )
        .mockResolvedValueOnce([{ id: ids[500], total: BigInt(501) }]);
      prisma.assessment.findMany.mockImplementation(async ({ where }: any) =>
        [...where.id.in].reverse().map((id: string) => ({ id })),
      );

      const assessments = await (service as any).searchedAssessments(
        'math',
        {},
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prisma.assessment.findMany).toHaveBeenCalledTimes(2);
      expect(assessments).toHaveLength(501);
      expect(assessments.at(-1)).toEqual({ id: 'assessment-501' });
    });
  });

  describe('generateStandard', () => {
    function question(id: string) {
      return {
        id,
        type: QuestionType.SINGLE_CHOICE,
        body: `Body ${id}`,
        explanation: 'Explanation',
        options: [
          { id: `${id}-a`, body: 'A', isCorrect: true },
          { id: `${id}-b`, body: 'B', isCorrect: false },
        ],
        course: { subject: { id: 'subject-1', title: 'Subject' } },
        placements: [
          {
            courseId: 'c1',
            chapterId: null,
            lessonId: null,
            sectionId: null,
            course: {
              id: 'c1',
              title: 'Course',
              status: ContentStatus.PUBLISHED,
              accessType: AccessType.PUBLIC,
            },
          },
        ],
      };
    }

    it('rejects generation when fewer eligible questions exist than requested', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
      });
      prisma.question.findMany.mockResolvedValue([question('q1')]);
      await expect(
        service.generateStandard(studentUserId, {
          courseIds: ['c1'],
          questionCount: 5,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        prisma.question.findMany.mock.calls[0][0].where.bankId,
      ).toBeUndefined();
    });

    it('restricts candidates to all selected question banks', async () => {
      const { service, prisma } = build();
      prisma.questionBank.findMany.mockResolvedValue([
        { id: 'bank-a', subjectId: 'subject-1' },
        { id: 'bank-b', subjectId: 'subject-1' },
      ]);
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
        subjectId: 'subject-1',
      });
      prisma.question.findMany.mockResolvedValue([question('q1')]);
      prisma.assessment.create.mockResolvedValue({ id: 'assessment-1' });
      prisma.assessmentQuestion.create.mockResolvedValue({});
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'assessment-1',
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId,
        status: AssessmentStatus.READY,
        scopes: [],
        questionBanks: [],
        title: 't',
        generationType: 'STANDARD',
        mode: AssessmentMode.EXAM,
        isTimed: false,
        durationSeconds: null,
        questionCount: 1,
        createdAt: new Date(),
      });
      prisma.assessmentAttempt.findUnique.mockResolvedValue(null);

      await service.generateStandard(studentUserId, {
        courseIds: ['c1'],
        questionBankIds: ['bank-a', 'bank-b'],
        questionCount: 1,
      });

      expect(prisma.question.findMany.mock.calls[0][0].where.bankId).toEqual({
        in: ['bank-a', 'bank-b'],
      });
      expect(
        prisma.assessment.create.mock.calls[0][0].data.questionBanks,
      ).toEqual({
        create: [{ questionBankId: 'bank-a' }, { questionBankId: 'bank-b' }],
      });
    });

    it('rejects a requested question bank that is inaccessible', async () => {
      const { service, prisma } = build();
      prisma.questionBank.findMany.mockResolvedValue([
        { id: 'bank-a', subjectId: 'subject-1' },
      ]);

      await expect(
        service.generateStandard(studentUserId, {
          courseIds: ['c1'],
          questionBankIds: ['bank-a', 'bank-b'],
          questionCount: 1,
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a timed request without a duration', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
      });
      await expect(
        service.generateStandard(studentUserId, {
          courseIds: ['c1'],
          questionCount: 1,
          isTimed: true,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('freezes exactly the requested number of questions as an immutable snapshot', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
      });
      prisma.question.findMany.mockResolvedValue([
        question('q1'),
        question('q2'),
        question('q3'),
      ]);
      prisma.assessment.create.mockResolvedValue({ id: 'assessment-1' });
      prisma.assessmentQuestion.create.mockResolvedValue({});
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'assessment-1',
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId,
        status: AssessmentStatus.READY,
        scopes: [],
        title: 't',
        generationType: 'STANDARD',
        mode: AssessmentMode.EXAM,
        isTimed: false,
        durationSeconds: null,
        questionCount: 2,
        createdAt: new Date(),
      });
      prisma.assessmentAttempt.findUnique.mockResolvedValue(null);

      await service.generateStandard(studentUserId, {
        courseIds: ['c1'],
        questionCount: 2,
      });

      expect(prisma.assessment.create).toHaveBeenCalledTimes(1);
      expect(prisma.assessment.create.mock.calls[0][0].data.questionCount).toBe(
        2,
      );
      expect(prisma.assessmentQuestion.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('admin createStandard', () => {
    const admin = { id: 'admin-1', role: 'ADMIN', sessionId: 's' } as any;

    it('excludes a question whose only matching placement sits under a draft chapter, even under a published course scope', async () => {
      const { service, prisma } = build();
      prisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: ContentStatus.PUBLISHED,
      });
      prisma.question.findMany.mockResolvedValue([
        {
          id: 'q1',
          type: QuestionType.SINGLE_CHOICE,
          body: 'Body',
          explanation: 'Explanation',
          options: [
            { id: 'q1-a', body: 'A', isCorrect: true },
            { id: 'q1-b', body: 'B', isCorrect: false },
          ],
          placements: [
            {
              courseId: null,
              chapterId: 'ch1',
              lessonId: null,
              sectionId: null,
              chapter: {
                id: 'ch1',
                courseId: 'c1',
                status: ContentStatus.DRAFT,
                course: {
                  id: 'c1',
                  status: ContentStatus.PUBLISHED,
                  accessType: AccessType.PUBLIC,
                },
              },
            },
          ],
        },
      ]);

      await expect(
        service.createStandard(admin, {
          scopes: [{ courseId: 'c1' }],
          questionCount: 1,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ownership on rename/remove', () => {
    it('refuses to rename an assessment the student does not own', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'a1',
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId: 'someone-else',
        scopes: [],
      });
      await expect(
        service.rename(studentUserId, 'a1', { title: 'New title' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses to delete a public admin-owned assessment', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'a1',
        ownerType: AssessmentOwnerType.ADMIN,
        scopes: [],
      });
      await expect(service.remove(studentUserId, 'a1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('attempt lifecycle', () => {
    it.each([
      [QuestionType.SHORT_ANSWER, ['Cairo'], undefined],
      [QuestionType.FILL_IN_THE_BLANK, ['Cairo'], undefined],
      [QuestionType.LONG_ANSWER, undefined, 'Award for identifying Cairo.'],
    ])(
      'AI-grades a %s response with its frozen criterion',
      async (type, acceptedAnswers, gradingRubric) => {
        const { service, prisma, communityStats, ai } = build();
        prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
          {
            id: 'answer-1',
            attemptId: 'attempt-1',
            responseText: 'Cairo',
            responseVersion: 3,
            responseLanguageCode: 'en',
            assessmentQuestion: {
              id: 'snapshot-question-1',
              type,
              body: 'What is the capital of Egypt?',
              maxPoints: 2,
              sourceQuestionId: 'source-question-1',
              acceptedAnswers,
              gradingRubric,
              contexts: [],
            },
          },
        ]);
        ai.gradeAnswer.mockResolvedValue({
          result: {
            awardedPoints: 2,
            feedback: 'Correct.',
            highlights: [
              { start: 0, end: 5, category: 'CORRECT', note: 'Correct city' },
            ],
          },
          model: 'test-model',
          raw: { safe: true },
          usage: { total_tokens: 1 },
        });

        await (service as any).gradePendingAiAnswers('attempt-1');

        expect(ai.gradeAnswer).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedAnswers:
              type === QuestionType.LONG_ANSWER ? undefined : ['Cairo'],
            gradingRubric:
              type === QuestionType.LONG_ANSWER
                ? 'Award for identifying Cairo.'
                : undefined,
          }),
        );
        expect(prisma.assessmentAnswerAiGradingRun.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ responseVersion: 3 }),
          }),
        );
        expect(prisma.assessmentAttemptAnswer.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              responseVersion: 3,
              outcome: 'PENDING_AI_GRADING',
            }),
            data: expect.objectContaining({
              awardedPoints: 2,
              outcome: 'CORRECT',
            }),
          }),
        );
        expect(communityStats.recordResponse).toHaveBeenCalledWith(
          prisma,
          'source-question-1',
          true,
        );
      },
    );

    it('does not call AI for empty responses or rubric-less long answers', async () => {
      const { service, prisma, ai } = build();
      prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
        {
          id: 'empty',
          attemptId: 'attempt-1',
          responseText: '',
          responseVersion: 1,
          assessmentQuestion: { type: QuestionType.SHORT_ANSWER },
        },
        {
          id: 'manual',
          attemptId: 'attempt-1',
          responseText: 'Essay',
          responseVersion: 1,
          assessmentQuestion: {
            type: QuestionType.LONG_ANSWER,
            gradingRubric: null,
          },
        },
      ]);
      await (service as any).gradePendingAiAnswers('attempt-1');
      expect(ai.gradeAnswer).not.toHaveBeenCalled();
      expect(prisma.assessmentAnswerAiGradingRun.create).not.toHaveBeenCalled();
    });

    it('returns not found when an AI retry targets a missing answer', async () => {
      const { service } = build();

      await expect(
        service.retryAiGrade(
          { id: 'admin-1', role: Role.ADMIN } as any,
          'missing-answer',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retains a failed run and leaves its answer pending for retry', async () => {
      const { service, prisma, ai } = build();
      prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
        {
          id: 'answer-1',
          attemptId: 'attempt-1',
          responseText: 'Cairo',
          responseVersion: 1,
          assessmentQuestion: {
            id: 'q1',
            type: QuestionType.SHORT_ANSWER,
            body: 'Capital?',
            maxPoints: 1,
            acceptedAnswers: ['Cairo'],
            sourceQuestionId: 'source-1',
            contexts: [],
          },
        },
      ]);
      ai.gradeAnswer.mockRejectedValue(new Error('provider unavailable'));
      await (service as any).gradePendingAiAnswers('attempt-1');
      expect(prisma.assessmentAttemptAnswer.updateMany).not.toHaveBeenCalled();
      expect(prisma.assessmentAnswerAiGradingRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('does not let a stale grading run overwrite a re-answered response', async () => {
      const { service, prisma, communityStats, ai } = build();
      prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
        {
          id: 'answer-1',
          attemptId: 'attempt-1',
          responseText: 'new response',
          responseVersion: 2,
          assessmentQuestion: {
            id: 'q1',
            type: QuestionType.FILL_IN_THE_BLANK,
            body: 'Fill',
            maxPoints: 1,
            acceptedAnswers: ['new response'],
            sourceQuestionId: 'source-1',
            contexts: [],
          },
        },
      ]);
      prisma.assessmentAttemptAnswer.updateMany.mockResolvedValue({ count: 0 });
      ai.gradeAnswer.mockResolvedValue({
        result: { awardedPoints: 1, feedback: 'Correct.', highlights: [] },
        model: 'test',
        raw: {},
        usage: {},
      });
      await (service as any).gradePendingAiAnswers('attempt-1');
      expect(prisma.assessmentAnswerAiGradingRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(communityStats.recordResponse).not.toHaveBeenCalled();
    });

    it('does not call AI during submit-time written autosave', async () => {
      const { service, prisma, ai } = build();
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'assessment-1',
        mode: AssessmentMode.EXAM,
      });
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: 'SUSPENDED',
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SHORT_ANSWER,
        acceptedAnswers: ['Cairo'],
        gradingRubric: null,
        options: [],
      });
      await service.autosaveAnswer(studentUserId, 'assessment-1', 'q1', {
        responseText: 'Cairo',
      });
      expect(ai.gradeAnswer).not.toHaveBeenCalled();
      expect(prisma.assessmentAttemptAnswer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ outcome: 'PENDING_AI_GRADING' }),
        }),
      );
    });

    it('AI-grades a short answer immediately in tutor mode', async () => {
      const { service, prisma, ai } = build();
      prisma.assessment.findUnique.mockResolvedValue({
        id: 'assessment-1',
        mode: AssessmentMode.TUTOR,
      });
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: 'SUSPENDED',
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SHORT_ANSWER,
        body: 'Capital?',
        acceptedAnswers: ['Cairo'],
        gradingRubric: null,
        maxPoints: 1,
        sourceQuestionId: 'source-1',
        options: [],
      });
      prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
        {
          id: 'answer-1',
          attemptId: 'attempt-1',
          responseText: 'Cairo',
          responseVersion: 1,
          responseLanguageCode: 'en',
          assessmentQuestion: {
            id: 'q1',
            type: QuestionType.SHORT_ANSWER,
            body: 'Capital?',
            acceptedAnswers: ['Cairo'],
            maxPoints: 1,
            sourceQuestionId: 'source-1',
            contexts: [],
          },
        },
      ]);
      ai.gradeAnswer.mockResolvedValue({
        result: { awardedPoints: 1, feedback: 'Correct.', highlights: [] },
        model: 'test',
        raw: {},
        usage: {},
      });
      await service.autosaveAnswer(studentUserId, 'assessment-1', 'q1', {
        responseText: 'Cairo',
        responseLanguageCode: 'en',
      });
      expect(ai.gradeAnswer).toHaveBeenCalledTimes(1);
    });

    it('authorizes a video retained by the student-owned assessment snapshot', async () => {
      const { service, prisma } = build();
      prisma.assessmentQuestion.findMany.mockResolvedValue([
        {
          videoAssetId: 'video-1',
          assessment: {
            ownerType: AssessmentOwnerType.STUDENT,
            studentUserId,
            status: AssessmentStatus.READY,
            scopes: [],
          },
        },
      ]);

      await expect(
        service.assertSnapshotVideoAccess(studentUserId, 'video-1'),
      ).resolves.toBeUndefined();
      expect(prisma.assessmentQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.arrayContaining([
              { videoAssetId: 'video-1' },
              { contentBlocks: { some: { assetId: 'video-1' } } },
              {
                options: {
                  some: { contentBlocks: { some: { assetId: 'video-1' } } },
                },
              },
            ]),
          },
        }),
      );
    });

    it('returns protected access only for an attachment in an accessible assessment snapshot', async () => {
      const { service, prisma, assets } = build();
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'assessment-question-1',
        assessment: {
          id: 'assessment-1',
          ownerType: AssessmentOwnerType.STUDENT,
          studentUserId,
          status: AssessmentStatus.READY,
          scopes: [],
        },
      });
      assets.getReady.mockResolvedValue({ id: 'attachment-1', kind: 'PDF' });
      assets.protectedAccess.mockReturnValue({
        url: 'https://cdn.example.test/attachment-1',
      });

      await expect(
        service.questionAttachmentAccess(
          studentUserId,
          'assessment-1',
          'assessment-question-1',
          'attachment-1',
        ),
      ).resolves.toEqual({ url: 'https://cdn.example.test/attachment-1' });
      expect(prisma.assessmentQuestion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { attachments: { some: { assetId: 'attachment-1' } } },
            ]),
          }),
        }),
      );
    });

    it('authorizes a video retained by a completed attempt after its assessment is archived', async () => {
      const { service, prisma } = build();
      prisma.assessmentQuestion.findMany.mockResolvedValue([
        {
          videoAssetId: 'video-1',
          assessment: {
            id: 'assessment-1',
            ownerType: AssessmentOwnerType.ADMIN,
            status: AssessmentStatus.ARCHIVED,
            scopes: [],
          },
        },
      ]);
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        status: AssessmentAttemptStatus.COMPLETED,
      });

      await expect(
        service.assertSnapshotVideoAccess(studentUserId, 'video-1'),
      ).resolves.toBeUndefined();
    });

    it('returns the linked video and timestamp for each attempt question', async () => {
      const { service, prisma } = build();
      prisma.studentQuestionNote.findMany.mockResolvedValue([
        { questionId: 'question-1', body: 'Review this rule' },
      ]);
      prisma.assessmentQuestion.findMany.mockResolvedValue([
        {
          id: 'assessment-question-1',
          sourceQuestionId: 'question-1',
          sortOrder: 1,
          type: QuestionType.SINGLE_CHOICE,
          body: 'Question',
          videoAssetId: 'video-1',
          videoAssetName: 'lesson.mp4',
          timestampSeconds: 42,
          attachments: [
            {
              assetId: 'attachment-1',
              assetKind: 'PDF',
              assetName: 'worksheet.pdf',
              sortOrder: 1,
            },
          ],
          contexts: [],
          options: [],
        },
      ]);

      const result = await (service as any).attemptStateDto(
        {
          id: 'attempt-1',
          studentUserId,
          status: AssessmentAttemptStatus.SUSPENDED,
          expiresAt: null,
        },
        { id: 'assessment-1', mode: AssessmentMode.EXAM },
      );

      expect(result.questions[0].video).toEqual({
        assetId: 'video-1',
        assetName: 'lesson.mp4',
        timestampSeconds: 42,
      });
      expect(result.questions[0].note).toBe('Review this rule');
      expect(result.questions[0].attachments).toEqual([
        {
          assetId: 'attachment-1',
          kind: 'PDF',
          assetName: 'worksheet.pdf',
          sortOrder: 1,
        },
      ]);
    });

    function readyAssessment(overrides: Partial<any> = {}) {
      return {
        id: 'a1',
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId,
        status: AssessmentStatus.READY,
        isTimed: false,
        durationSeconds: null,
        questionCount: 1,
        mode: AssessmentMode.EXAM,
        scopes: [],
        ...overrides,
      };
    }

    it('autosaves an answer and computes correctness for a single-choice question', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        explanation: 'why',
        options: [
          { id: 'opt-a', isCorrect: true },
          { id: 'opt-b', isCorrect: false },
        ],
      });

      const result = await service.autosaveAnswer(studentUserId, 'a1', 'q1', {
        selectedOptionIds: ['opt-a'],
      });

      expect(prisma.assessmentAttemptAnswer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isCorrect: true }),
        }),
      );
      // EXAM mode hides correctness from the immediate autosave response.
      expect(result.isCorrect).toBeNull();
    });

    it('reveals correctness immediately in TUTOR mode', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(
        readyAssessment({ mode: AssessmentMode.TUTOR }),
      );
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        explanation: 'why',
        options: [
          { id: 'opt-a', isCorrect: true },
          { id: 'opt-b', isCorrect: false },
        ],
      });

      const result = await service.autosaveAnswer(studentUserId, 'a1', 'q1', {
        selectedOptionIds: ['opt-b'],
      });
      expect(result.isCorrect).toBe(false);
    });

    it('records every material answer change with outcome direction', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        explanation: null,
        options: [
          { id: 'opt-a', isCorrect: true },
          { id: 'opt-b', isCorrect: false },
        ],
      });
      prisma.assessmentAttemptAnswer.findUnique.mockResolvedValue({
        id: 'answer-1',
        selectedOptionIds: ['opt-a'],
        isCorrect: true,
      });
      prisma.assessmentAttemptAnswer.upsert.mockResolvedValue({
        id: 'answer-1',
      });

      await service.autosaveAnswer(studentUserId, 'a1', 'q1', {
        selectedOptionIds: ['opt-b'],
      });

      expect(prisma.assessmentAnswerChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromOutcome: 'CORRECT',
          toOutcome: 'INCORRECT',
        }),
      });
    });

    it('rejects selecting an option that does not belong to the question', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        explanation: 'why',
        options: [{ id: 'opt-a', isCorrect: true }],
      });
      await expect(
        service.autosaveAnswer(studentUserId, 'a1', 'q1', {
          selectedOptionIds: ['not-an-option'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('force-submits an expired suspended attempt and scores it from saved answers', async () => {
      const { service, prisma } = build();
      const expiredAttempt = {
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: new Date('2000-01-01'),
      };
      prisma.assessmentAttempt.updateMany.mockResolvedValue({ count: 1 });
      prisma.assessmentAttemptAnswer.findMany.mockResolvedValue([
        { isCorrect: true },
        { isCorrect: false },
      ]);
      prisma.assessmentAttempt.update.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.COMPLETED,
        score: 1,
      });

      const result = await (service as any).ensureNotExpired(expiredAttempt);

      expect(prisma.assessmentAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'attempt-1', status: AssessmentAttemptStatus.SUSPENDED },
          data: expect.objectContaining({
            status: AssessmentAttemptStatus.COMPLETED,
          }),
        }),
      );
      expect(prisma.assessmentAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { score: 1 } }),
      );
      expect(result.status).toBe(AssessmentAttemptStatus.COMPLETED);
    });

    it('finalizeAttempt loses the race: returns the winner state instead of re-scoring', async () => {
      const { service, prisma } = build();
      prisma.assessmentAttempt.updateMany.mockResolvedValue({ count: 0 });
      const winnerState = {
        id: 'attempt-1',
        status: AssessmentAttemptStatus.COMPLETED,
        score: 7,
        submittedAt: new Date(),
      };
      prisma.assessmentAttempt.findUniqueOrThrow.mockResolvedValue(winnerState);

      const result = await (service as any).finalizeAttempt('attempt-1');

      expect(prisma.assessmentAttempt.update).not.toHaveBeenCalled();
      expect(prisma.assessmentAttemptAnswer.findMany).not.toHaveBeenCalled();
      expect(result).toBe(winnerState);
    });

    it('autosaveAnswer loses the race: rejects and never writes the answer once the attempt is no longer suspended', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
        expiresAt: null,
      });
      prisma.assessmentQuestion.findFirst.mockResolvedValue({
        id: 'q1',
        type: QuestionType.SINGLE_CHOICE,
        explanation: 'why',
        options: [
          { id: 'opt-a', isCorrect: true },
          { id: 'opt-b', isCorrect: false },
        ],
      });
      prisma.assessmentAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.autosaveAnswer(studentUserId, 'a1', 'q1', {
          selectedOptionIds: ['opt-a'],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.assessmentAttemptAnswer.upsert).not.toHaveBeenCalled();
    });

    it('does not re-finalize an attempt that is already completed', async () => {
      const { service, prisma } = build();
      const completed = {
        id: 'attempt-1',
        status: AssessmentAttemptStatus.COMPLETED,
        expiresAt: new Date('2000-01-01'),
      };
      await (service as any).ensureNotExpired(completed);
      expect(prisma.assessmentAttempt.update).not.toHaveBeenCalled();
    });

    it('submitAttempt is idempotent once the attempt is already completed', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.COMPLETED,
        score: 3,
        totalPoints: 4,
        totalQuestions: 3,
        submittedAt: new Date(),
      });

      await expect(
        service.submitAttempt(studentUserId, 'a1'),
      ).resolves.toMatchObject({
        score: 3,
        percentage: 75,
      });

      expect(prisma.assessmentAttempt.update).not.toHaveBeenCalled();
    });

    it('rejects fetching a result before the attempt has been submitted', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(readyAssessment());
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.SUSPENDED,
      });
      await expect(service.result(studentUserId, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('keeps a completed attempt readable after the admin assessment is archived', async () => {
      const { service, prisma } = build();
      prisma.assessment.findUnique.mockResolvedValue(
        readyAssessment({
          ownerType: AssessmentOwnerType.ADMIN,
          studentUserId: undefined,
          status: AssessmentStatus.ARCHIVED,
        }),
      );
      prisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: 'attempt-1',
        status: AssessmentAttemptStatus.COMPLETED,
        score: 1,
        totalQuestions: 1,
        submittedAt: new Date(),
      });
      prisma.assessmentQuestion.findMany.mockResolvedValue([
        {
          id: 'assessment-question-1',
          sourceQuestionId: 'question-1',
          sortOrder: 1,
          type: QuestionType.SINGLE_CHOICE,
          body: 'Question',
          attachments: [
            {
              assetId: 'attachment-1',
              assetKind: 'PDF',
              assetName: 'worksheet.pdf',
              sortOrder: 1,
            },
          ],
          contexts: [],
          options: [],
          placements: [],
        },
      ]);

      await expect(service.result(studentUserId, 'a1')).resolves.toMatchObject({
        score: 1,
        questions: [
          {
            attachments: [
              {
                assetId: 'attachment-1',
                kind: 'PDF',
                assetName: 'worksheet.pdf',
                sortOrder: 1,
              },
            ],
          },
        ],
      });
      await expect(
        service.currentAttemptState(studentUserId, 'a1'),
      ).resolves.toMatchObject({ status: AssessmentAttemptStatus.COMPLETED });
    });
  });
});
