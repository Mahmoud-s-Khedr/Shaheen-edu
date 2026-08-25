import {
  QuestionImportMediaAssignmentOwner,
  QuestionImportMediaAssignmentStatus,
  QuestionImportStatus,
  Role,
} from '../../common/types/roles.enum';
import { ServiceUnavailableException } from '@nestjs/common';
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
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', children: [] }),
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
    expect(queue.enqueueChunk).toHaveBeenCalledWith('batch-1', 'chunk-109');
  });

  function mediaReviewService() {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
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
      {} as any,
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
    return { createMany, service };
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
});
