/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- private collaborators are deliberately isolated in these focused service tests. */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import {
  ContentStatus,
  QuestionStatus,
  QuestionType,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { BulkPublishQuestionsDto } from './dto/question-banks.dto';
import { QuestionBanksService } from './question-banks.service';

describe('QuestionBanksService bulkPublishQuestions', () => {
  const admin: RequestUser = {
    id: 'admin-1',
    role: Role.ADMIN,
    sessionId: 's1',
  };

  function buildService() {
    const tx = { question: { update: jest.fn().mockResolvedValue(undefined) } };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const audit = { recordWithClient: jest.fn().mockResolvedValue(undefined) };
    const service = new QuestionBanksService(prisma as any, audit as any);
    return { service, prisma, tx, audit };
  }

  function item(id: string, status: QuestionStatus, overrides: object = {}) {
    return {
      id,
      status,
      replacesQuestionId: null,
      ...overrides,
    };
  }

  it('directly publishes draft, rejected, and in-review questions', async () => {
    const { service, prisma, tx, audit } = buildService();
    const items = {
      draft: item('draft', QuestionStatus.DRAFT, { replacesQuestionId: 'old' }),
      rejected: item('rejected', QuestionStatus.REJECTED),
      review: item('review', QuestionStatus.IN_REVIEW),
    };
    (service as any).questionWithClient = jest.fn(
      (_client: unknown, id: keyof typeof items) => items[id],
    );
    (service as any).validate = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.bulkPublishQuestions(admin, ['draft', 'rejected', 'review']),
    ).resolves.toEqual({
      publishedIds: ['draft', 'rejected', 'review'],
      failed: [],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft' },
        data: expect.objectContaining({
          status: QuestionStatus.PUBLISHED,
          reviewedById: admin.id,
          updatedById: admin.id,
          publishedAt: expect.any(Date),
          reviewedAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old' },
        data: expect.objectContaining({ status: QuestionStatus.ARCHIVED }),
      }),
    );
    expect(audit.recordWithClient).toHaveBeenCalledTimes(3);
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'QUESTION_PUBLISHED',
        targetId: 'draft',
      }),
    );
  });

  it('returns failures for published and archived questions without republishing them', async () => {
    const { service, prisma, tx } = buildService();
    const items = {
      published: item('published', QuestionStatus.PUBLISHED),
      archived: item('archived', QuestionStatus.ARCHIVED),
    };
    (service as any).questionWithClient = jest.fn(
      (_client: unknown, id: keyof typeof items) => items[id],
    );

    await expect(
      service.bulkPublishQuestions(admin, ['published', 'archived']),
    ).resolves.toEqual({
      publishedIds: [],
      failed: [
        {
          id: 'published',
          reason:
            'Only draft, rejected, or in-review questions can be bulk published',
        },
        {
          id: 'archived',
          reason:
            'Only draft, rejected, or in-review questions can be bulk published',
        },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.question.update).not.toHaveBeenCalled();
  });

  it('continues after individual validation failures', async () => {
    const { service, prisma, tx } = buildService();
    const items = {
      valid: item('valid', QuestionStatus.DRAFT),
      invalid: item('invalid', QuestionStatus.REJECTED),
    };
    (service as any).questionWithClient = jest.fn(
      (_client: unknown, id: keyof typeof items) => items[id],
    );
    (service as any).validate = jest.fn((question: { id: string }) => {
      if (question.id === 'invalid')
        throw new ConflictException(
          'Question options do not satisfy its answer type',
        );
    });

    await expect(
      service.bulkPublishQuestions(admin, ['valid', 'invalid']),
    ).resolves.toEqual({
      publishedIds: ['valid'],
      failed: [
        {
          id: 'invalid',
          reason: 'Question options do not satisfy its answer type',
        },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.question.update).toHaveBeenCalledTimes(1);
  });

  it('hides unexpected failures while logging their details', async () => {
    const { service } = buildService();
    const logError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    (service as any).questionWithClient = jest.fn(() => {
      throw new Error('database connection details must not reach the client');
    });

    await expect(
      service.bulkPublishQuestions(admin, ['question-1']),
    ).resolves.toEqual({
      publishedIds: [],
      failed: [{ id: 'question-1', reason: 'Unable to publish question' }],
    });
    expect(logError).toHaveBeenCalled();
  });

  it('reports serialization conflicts as a retryable question change', async () => {
    const { service, prisma } = buildService();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('serialization failure', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.bulkPublishQuestions(admin, ['question-1']),
    ).resolves.toEqual({
      publishedIds: [],
      failed: [
        {
          id: 'question-1',
          reason:
            'Question changed while it was being published; refresh and retry',
        },
      ],
    });
  });

  it('enforces the existing admin authorization', async () => {
    const { service } = buildService();
    await expect(
      service.bulkPublishQuestions(
        { id: 'student-1', role: Role.STUDENT, sessionId: 's1' },
        ['question-1'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps normal single-question publishing limited to in-review questions', async () => {
    const { service, prisma, tx } = buildService();
    (service as any).questionWithClient = jest.fn(() =>
      item('draft', QuestionStatus.DRAFT),
    );

    await expect(service.publishQuestion(admin, 'draft')).rejects.toThrow(
      'Only questions in review can be published',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.question.update).not.toHaveBeenCalled();
  });

  it('enforces the normal publication validation rules', async () => {
    const { service, prisma, tx } = buildService();
    (service as any).questionWithClient = jest.fn(() =>
      item('invalid-options', QuestionStatus.DRAFT, {
        body: 'Which option is correct?',
        explanation: 'Because it is correct.',
        maxPoints: 1,
        structuredExplanation: null,
        source: { status: ContentStatus.PUBLISHED },
        bank: { status: ContentStatus.PUBLISHED },
        type: QuestionType.SINGLE_CHOICE,
        options: [{ isCorrect: true, contentBlocks: [] }],
        acceptedAnswers: null,
        gradingRubric: null,
        answerOrigin: null,
        placements: [{}],
        course: {
          status: ContentStatus.PUBLISHED,
          subject: { status: ContentStatus.PUBLISHED },
        },
        assets: [],
        contentBlocks: [],
        contexts: [],
        videoLink: null,
      }),
    );

    await expect(
      service.bulkPublishQuestions(admin, ['invalid-options']),
    ).resolves.toEqual({
      publishedIds: [],
      failed: [
        {
          id: 'invalid-options',
          reason: 'Question options do not satisfy its answer type',
        },
      ],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.question.update).not.toHaveBeenCalled();
  });
});

describe('BulkPublishQuestionsDto', () => {
  it('requires a non-empty, unique array of at most 300 IDs', async () => {
    for (const questionIds of [
      [],
      ['duplicate', 'duplicate'],
      Array(301).fill('id'),
    ]) {
      const dto = Object.assign(new BulkPublishQuestionsDto(), { questionIds });
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});
