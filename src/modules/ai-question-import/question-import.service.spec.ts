import {
  QuestionImportMediaAssignmentOwner,
  QuestionImportMediaAssignmentStatus,
  QuestionImportStatus,
  Role,
} from '../../common/types/roles.enum';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QuestionImportService } from './question-import.service';

describe('QuestionImportService review summaries', () => {
  function serviceWith() {
    return new QuestionImportService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        get: jest.fn().mockReturnValue({ questionImportModel: 'test-model' }),
      } as any,
    );
  }

  it.each(
    ['body', 'explanation'].flatMap((field) =>
      [123, false, {}, [], null, undefined, '   '].map((value) => ({
        field,
        value,
      })),
    ),
  )(
    'rejects invalid legacy $field: $value with a bad request',
    ({ field, value }) => {
      expect(() =>
        serviceWith()['normalizeLegacyReviewCandidate']({
          type: 'SHORT_ANSWER',
          body: 'Question',
          explanation: 'Explanation',
          acceptedAnswers: ['Answer'],
          [field]: value,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('preserves valid legacy candidate text normalization', () => {
    expect(
      serviceWith()['normalizeLegacyReviewCandidate']({
        type: 'SHORT_ANSWER',
        body: '  Question  ',
        explanation: '  Explanation  ',
        acceptedAnswers: ['Answer'],
      }),
    ).toMatchObject({ body: 'Question', explanation: 'Explanation' });
  });

  it('uses a crop description, never a reviewer-assignment reason, as image alt text', () => {
    const blocks = (serviceWith() as any).anchoredBlocks(
      'Question text',
      [
        {
          placementAnchor: 'START',
          reason: 'Manually added by reviewer from ranked candidates.',
          media: {
            assetId: 'asset-1',
            description: 'Microscope image of plant cells',
          },
        },
      ],
      () => true,
    );

    expect(blocks).toEqual([
      {
        type: 'IMAGE',
        assetId: 'asset-1',
        altText: 'Microscope image of plant cells',
      },
      { type: 'TEXT', text: 'Question text' },
    ]);
  });

  it('accepts a long-answer draft without an AI rubric or explanation', () => {
    const candidate = (serviceWith() as any).normalizeExtractedDraft({
      type: 'LONG_ANSWER',
      body: 'Explain photosynthesis.',
    });

    expect(candidate).toMatchObject({
      type: 'LONG_ANSWER',
      body: 'Explain photosynthesis.',
    });
    expect(candidate.gradingRubric).toBeUndefined();
  });

  it('rejects answer-bearing fields in an extracted draft', () => {
    expect(() =>
      (serviceWith() as any).normalizeExtractedDraft({
        type: 'LONG_ANSWER',
        body: 'Explain photosynthesis.',
        gradingRubric: '  Include light, water, carbon dioxide, and glucose.  ',
      }),
    ).toThrow('Extracted drafts cannot include gradingRubric');
  });

  it('marks a persisted queued batch retryable when Redis enqueue fails', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = new QuestionImportService(
      { questionImportBatch: { update } } as any,
      { enqueue: jest.fn().mockRejectedValue(new Error('redis down')) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        get: jest.fn().mockReturnValue({ questionImportModel: 'test-model' }),
      } as any,
    );

    await expect(
      (service as any).enqueueBatchOrFail('batch-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: {
        status: QuestionImportStatus.FAILED,
        errorSummary: 'Unable to enqueue import work',
      },
    });
  });

  it('clears a completed-with-errors summary when every review item is resolved', async () => {
    const service = serviceWith();
    const tx = {
      questionImportItem: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3) // created
          .mockResolvedValueOnce(0) // invalid
          .mockResolvedValueOnce(0) // review required
          .mockResolvedValueOnce(1), // excluded
      },
      questionImportChunk: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0) // failed
          .mockResolvedValueOnce(0) // unfinished
          .mockResolvedValueOnce(2), // completed
      },
      questionImportBatch: { update: jest.fn() },
    };

    await (service as any).refreshReviewSummary(tx, 'batch-1');

    expect(tx.questionImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({
          status: QuestionImportStatus.COMPLETED,
          totalItems: 4,
          createdQuestions: 3,
          invalidItems: 0,
          failedItems: 0,
          errorSummary: null,
        }),
      }),
    );
  });

  it('uses AWAITING_REVIEW only when candidate questions need admin review', async () => {
    const service = serviceWith();
    const tx = {
      questionImportItem: {
        count: jest
          .fn()
          .mockResolvedValueOnce(1) // created
          .mockResolvedValueOnce(0) // invalid
          .mockResolvedValueOnce(1) // review required
          .mockResolvedValueOnce(0), // excluded
      },
      questionImportChunk: {
        count: jest
          .fn()
          .mockResolvedValueOnce(0) // failed
          .mockResolvedValueOnce(0) // unfinished
          .mockResolvedValueOnce(2), // completed
      },
      questionImportBatch: { update: jest.fn() },
    };

    await (service as any).refreshReviewSummary(tx, 'batch-1');

    expect(tx.questionImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QuestionImportStatus.AWAITING_REVIEW,
        }),
      }),
    );
  });

  it('retries one failed chunk without resetting other candidates', async () => {
    const chunkUpdate = jest.fn().mockResolvedValue({});
    const batchUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      questionImportBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch-1',
          children: [],
          schemaVersion: 'question-import-v6',
        }),
        update: batchUpdate,
      },
      questionImportChunk: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'chunk-109',
          batchId: 'batch-1',
          sequence: 109,
          status: 'FAILED',
        }),
        update: chunkUpdate,
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const queue = { enqueue: jest.fn(), enqueueChunk: jest.fn() };
    const audit = { record: jest.fn() };
    const service = new QuestionImportService(
      prisma as any,
      queue as any,
      audit as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        get: jest.fn().mockReturnValue({
          questionImportModel: 'test-model',
          openRouterApiKey: 'test-key',
        }),
      } as any,
    );
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'batch-1' } as any);

    await service.retryChunk(
      { id: 'admin-1', role: Role.ADMIN } as any,
      'batch-1',
      'chunk-109',
    );

    expect(chunkUpdate).toHaveBeenCalledWith({
      where: { id: 'chunk-109' },
      data: { status: 'PENDING', attemptCount: 0, errorDetail: null },
    });
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({ status: QuestionImportStatus.QUEUED }),
      }),
    );
    expect(batchUpdate.mock.calls[0][0].data).not.toHaveProperty(
      'schemaVersion',
    );
    expect(queue.enqueueChunk).toHaveBeenCalledWith('batch-1', 'chunk-109');
  });

  function mediaReviewService() {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const audit = { recordWithClient: jest.fn() };
    const tx = {
      questionImportItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item-1',
          sequence: 1,
          questionId: null,
          normalizedOutput: { options: [] },
          batch: {
            id: 'batch-1',
            parentId: null,
            schemaVersion: 'question-import-v4',
          },
          chunk: {
            text: JSON.stringify({
              questions: [{ contextIds: ['CTX_TEXT_B00001_B00002'] }],
            }),
          },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
      questionImportMedia: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'media-1', mediaKey: 'M0001' }]),
      },
      questionImportMediaAssignment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        createMany,
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn((work) => work(tx)) };
    const service = new QuestionImportService(
      prisma as any,
      {} as any,
      audit as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        get: jest.fn().mockReturnValue({
          questionImportModel: 'test-model',
          openRouterApiKey: 'test-key',
        }),
      } as any,
    );
    return { audit, createMany, service, tx };
  }

  it('releases exclusive ownership when a reviewer rejects an assignment', async () => {
    const { createMany, service } = mediaReviewService();

    await service.updateItemMedia(
      { id: 'admin-1', role: Role.ADMIN } as any,
      'batch-1',
      'item-1',
      {
        assignments: [
          {
            mediaKey: 'M0001',
            owner: QuestionImportMediaAssignmentOwner.QUESTION,
            ownerReference: 'QUESTION',
            status: QuestionImportMediaAssignmentStatus.REJECTED,
          },
        ],
      },
    );

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ exclusiveOwnershipKey: null })],
      }),
    );
  });

  it('rejects duplicate visual assignment identities before persisting them', async () => {
    const { service } = mediaReviewService();
    const assignment = {
      mediaKey: 'M0001',
      owner: QuestionImportMediaAssignmentOwner.CONTEXT,
      ownerReference: 'CTX_TEXT_B00001_B00002',
      status: QuestionImportMediaAssignmentStatus.APPROVED,
    };

    await expect(
      service.updateItemMedia(
        { id: 'admin-1', role: Role.ADMIN } as any,
        'batch-1',
        'item-1',
        { assignments: [assignment, assignment] },
      ),
    ).rejects.toThrow('Each visual may be assigned only once');
  });

  it('allows an admin to reuse a visual without an AI override flag', async () => {
    const { audit, createMany, service, tx } = mediaReviewService();
    tx.questionImportMediaAssignment.findMany.mockResolvedValue([
      {
        mediaId: 'media-1',
        owner: QuestionImportMediaAssignmentOwner.QUESTION,
        ownerReference: 'QUESTION',
        importItem: {
          id: 'item-elsewhere',
          batchId: 'batch-1',
          sequence: 2,
          sourceNumber: null,
          globalOrder: 2,
          section: null,
          questionId: null,
        },
      },
    ]);

    await service.updateItemMedia(
      { id: 'admin-1', role: Role.ADMIN } as any,
      'batch-1',
      'item-1',
      {
        assignments: [
          {
            mediaKey: 'M0001',
            owner: QuestionImportMediaAssignmentOwner.QUESTION,
            ownerReference: 'QUESTION',
            status: QuestionImportMediaAssignmentStatus.APPROVED,
          },
        ],
      },
    );

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            exclusiveOwnershipKey: null,
            reviewNote: expect.stringContaining(
              'ADMIN VISUAL OWNERSHIP DECISION',
            ),
          }),
        ],
      }),
    );
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'AI_QUESTION_IMPORT_VISUAL_OWNERSHIP_OVERRIDDEN',
        metadata: expect.objectContaining({
          mediaKeys: ['M0001'],
          reason: null,
        }),
      }),
    );
  });

  it('does not require a reason for an administrator visual decision', async () => {
    const { service } = mediaReviewService();

    await expect(
      service.updateItemMedia(
        { id: 'admin-1', role: Role.ADMIN } as any,
        'batch-1',
        'item-1',
        {
          assignments: [
            {
              mediaKey: 'M0001',
              owner: QuestionImportMediaAssignmentOwner.QUESTION,
              ownerReference: 'QUESTION',
              status: QuestionImportMediaAssignmentStatus.APPROVED,
            },
          ],
          overrideVisualSafeguards: true,
        },
      ),
    ).resolves.toEqual({ id: 'item-1' });
  });

  it('records, but does not reject, a conflicting visual assignment', async () => {
    const { audit, createMany, service, tx } = mediaReviewService();
    tx.questionImportMediaAssignment.findMany.mockResolvedValue([
      {
        mediaId: 'media-1',
        owner: QuestionImportMediaAssignmentOwner.OPTION,
        ownerReference: 'OPTION:1',
        importItem: {
          id: 'item-elsewhere',
          batchId: 'batch-1',
          sequence: 4,
          sourceNumber: '12',
          globalOrder: 12,
          section: 'Cell biology',
          questionId: null,
        },
      },
    ]);

    await expect(
      service.updateItemMedia(
        { id: 'admin-1', role: Role.ADMIN } as any,
        'batch-1',
        'item-1',
        {
          assignments: [
            {
              mediaKey: 'M0001',
              owner: QuestionImportMediaAssignmentOwner.QUESTION,
              ownerReference: 'QUESTION',
              status: QuestionImportMediaAssignmentStatus.APPROVED,
            },
          ],
        },
      ),
    ).resolves.toEqual({ id: 'item-1' });

    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ exclusiveOwnershipKey: null })],
      }),
    );
    expect(audit.recordWithClient).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        metadata: expect.objectContaining({
          conflicts: [
            expect.objectContaining({
              mediaKey: 'M0001',
              existingAssignment: expect.objectContaining({
                location: 'option 2',
              }),
            }),
          ],
        }),
      }),
    );
  });
});

describe('Import retries preserve the original schema', () => {
  const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
  function setup(schemaVersion: string) {
    const prisma = {
      questionImportBatch: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'batch',
          children: [],
          schemaVersion,
          inputType: 'ASSET',
          sourceAsset: { mimeType: 'application/pdf' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      questionImportItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'item',
          chunkId: 'chunk',
          questionId: null,
        }),
        deleteMany: jest.fn(),
      },
      questionImportChunk: {
        findMany: jest.fn().mockResolvedValue([{ id: 'chunk' }]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      questionImportPage: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'page', status: 'FAILED' }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn): Promise<any> =>
        typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
      ),
    };
    const queue = { enqueue: jest.fn(), enqueuePage: jest.fn() };
    const service = new QuestionImportService(
      prisma as any,
      queue as any,
      { record: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        get: () => ({
          questionImportModel: 'test',
          openRouterApiKey: 'key',
          pdfTranscriptionModel: 'ocr',
        }),
      } as any,
    );
    jest.spyOn(service, 'get').mockResolvedValue({ id: 'batch' } as any);
    return { service, prisma };
  }

  it.each(['question-import-v6', 'question-import-v7'])(
    'preserves %s on item, batch, and page retry',
    async (schemaVersion) => {
      const { service, prisma } = setup(schemaVersion);
      await service.retry(actor, 'batch', 'item');
      expect(prisma.questionImportItem.deleteMany).toHaveBeenCalledWith({
        where: { batchId: 'batch', chunkId: 'chunk', questionId: null },
      });
      await service.retry(actor, 'batch');
      await service.retryPage(actor, 'batch', 1);
      for (const call of [
        ...prisma.questionImportBatch.update.mock.calls,
        ...prisma.questionImportBatch.updateMany.mock.calls,
      ] as any[])
        expect(call[0].data).not.toHaveProperty('schemaVersion');
    },
  );

  it('requires an approved option visual before accepting empty option text', () => {
    const { service } = setup('question-import-v7');
    const candidate = {
      type: 'SINGLE_CHOICE',
      body: 'Choose a figure',
      options: [{ body: '' }, { body: 'A' }],
    };
    expect(() => service['normalizeExtractedDraft'](candidate)).toThrow();
    expect(
      service['normalizeExtractedDraft'](candidate, new Set([0])).options[0],
    ).toEqual({ body: '', isCorrect: false });
  });
});
