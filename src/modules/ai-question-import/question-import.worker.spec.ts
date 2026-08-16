import { QuestionImportChunkStatus } from '../../common/types/roles.enum';
import { QuestionImportWorker } from './question-import.worker';

const candidate = (body: string) => ({
  body,
  type: 'SINGLE_CHOICE' as const,
  explanation: { keywords: 'key', eliminationStrategy: 'remove wrong', whyCorrect: 'correct', generalRule: 'rule', whatIf: 'not applicable', commonMistakes: 'mistake' },
  answer: { selectedOptionIndexes: [0], confidence: 0.9, origin: 'INFERRED' as const },
  warnings: [],
  options: [
    { body: 'Correct', isCorrect: true },
    { body: 'Incorrect', isCorrect: false },
  ],
});

describe('QuestionImportWorker', () => {
  const aiConfig = {
    workerConcurrency: 1,
    requestTimeoutMs: 60_000,
    segmentationMaxCharacters: 500_000,
    extractionMaxCharacters: 80_000,
  };

  function workerWith(overrides: Record<string, any> = {}) {
    const questionImportItem = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      update: jest.fn().mockResolvedValue({}),
    };
    const tx = { questionImportItem };
    const prisma = {
      questionImportChunk: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      questionImportItem,
      $transaction: jest.fn((callback: any) => typeof callback === 'function' ? callback(tx) : Promise.all(callback)),
      ...overrides,
    };
    const questions = {
      createImportedDraftWithClient: jest.fn().mockResolvedValue({ id: 'new-question' }),
    };
    const client = { extractQuestions: jest.fn(), segmentSource: jest.fn() };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ai' ? aiConfig : 'redis://localhost:6379',
      ),
    };
    return {
      worker: new QuestionImportWorker(
        prisma as any,
        {} as any,
        {} as any,
        client as any,
        questions as any,
        config as any,
      ),
      prisma,
      tx,
      questions,
      client,
    };
  }

  it('replays a chunk without recreating sequences that already produced a question', async () => {
    const { worker, prisma, tx, questions, client } = workerWith();
    prisma.questionImportItem.findMany.mockResolvedValue([{ sequence: 1 }]);
    client.extractQuestions.mockResolvedValue({
      items: [candidate('Existing question'), candidate('Retryable question')],
      raw: {},
      usage: {},
    });

    await (worker as any).processChunk(
      {
        id: 'batch-1',
        createdById: 'admin-1',
        bankId: 'bank-1',
        sourceId: 'source-1',
        courseId: 'course-1',
        placements: [],
      },
      {
        id: 'chunk-1',
        text: JSON.stringify([
          {
            firstBlock: 'B00001',
            lastBlock: 'B00001',
            text: 'Existing question',
            sourceNumber: '1', contextIds: [],
          },
          {
            firstBlock: 'B00002',
            lastBlock: 'B00002',
            text: 'Retryable question',
            sourceNumber: '2', contextIds: [],
          },
        ]),
      },
    );

    expect(questions.createImportedDraftWithClient).toHaveBeenCalledTimes(1);
    expect(questions.createImportedDraftWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ body: 'Retryable question' }),
      tx,
    );
    expect(prisma.questionImportItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.questionImportChunk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'chunk-1', status: QuestionImportChunkStatus.PENDING },
        data: expect.objectContaining({ status: QuestionImportChunkStatus.PROCESSING }),
      }),
    );
    expect(prisma.questionImportItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sequence: 2,
          status: 'PROCESSING',
        }),
      }),
    );
    expect(prisma.questionImportItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CREATED', questionId: 'new-question' }) }));
    expect(prisma.questionImportChunk.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QuestionImportChunkStatus.COMPLETED,
        }),
      }),
    );
  });

  it('reclaims only processing chunks whose worker lease has expired', async () => {
    const { worker, prisma } = workerWith();

    await (worker as any).reclaimStaleProcessingChunks('batch-1');

    expect(prisma.questionImportChunk.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          batchId: 'batch-1',
          status: QuestionImportChunkStatus.PROCESSING,
          updatedAt: { lt: expect.any(Date) },
        }),
        data: expect.objectContaining({
          status: QuestionImportChunkStatus.PENDING,
        }),
      }),
    );
  });

  it('persists segmentation metadata and extraction chunks in one transaction', async () => {
    const { worker, prisma } = workerWith();
    const tx = {
      questionImportBatch: { update: jest.fn() },
      questionImportChunk: { createMany: jest.fn() },
      questionContext: { create: jest.fn() },
      questionImportItem: { createMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await (worker as any).persistSegmentationAndChunks(
      'batch-1',
      [{ blockKey: 'B00001', text: 'Question text' }],
      {
        result: {
          contexts: [],
          questions: [
            {
              id: 'Q1', sourceNumber: '1', contextIds: [], detectedType: 'SINGLE_CHOICE',
              firstBlock: 'B00001',
              lastBlock: 'B00001',
            },
          ],
          excluded: [],
          warnings: [],
        },
        raw: { response: true },
        usage: { tokens: 1 },
      },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.questionImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalChunks: 1,
          segmentationRawOutput: { response: true },
        }),
      }),
    );
    expect(tx.questionImportChunk.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ batchId: 'batch-1', sequence: 1 })],
      }),
    );
  });

  it('does not persist segmentation metadata outside the transaction when chunk creation fails', async () => {
    const { worker, prisma } = workerWith();
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(
      (worker as any).persistSegmentationAndChunks(
        'batch-1',
        [{ blockKey: 'B00001', text: 'Question text' }],
        {
          result: {
          contexts: [],
          questions: [
            {
              id: 'Q1', sourceNumber: '1', contextIds: [], detectedType: 'SINGLE_CHOICE',
              firstBlock: 'B00001',
              lastBlock: 'B00001',
              },
            ],
            excluded: [],
            warnings: [],
          },
          raw: { response: true },
          usage: {},
        },
      ),
    ).rejects.toThrow('database unavailable');

    expect(prisma.questionImportChunk.update).not.toHaveBeenCalled();
  });

  it('does not create import items for source content excluded during segmentation', async () => {
    const { worker, prisma } = workerWith();
    const tx = {
      questionImportBatch: { update: jest.fn() },
      questionImportChunk: { createMany: jest.fn() },
      questionContext: { create: jest.fn() },
      questionImportItem: { createMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await (worker as any).persistSegmentationAndChunks(
      'batch-1',
      [{ blockKey: 'B00001', text: 'Essay question' }],
      {
        result: {
          contexts: [],
          questions: [],
          excluded: [{ firstBlock: 'B00001', lastBlock: 'B00001', sourceNumber: '1', detectedType: 'ESSAY', reason: 'Unsupported type' }],
          warnings: [],
        },
        raw: { response: true },
        usage: { tokens: 1 },
      },
    );

    expect(tx.questionImportItem.createMany).not.toHaveBeenCalled();
  });

  it('accepts one reusable context referenced by multiple selectable questions and excludes essays', () => {
    const { worker } = workerWith();
    const issue = (worker as any).validateSegmentation(
      [
        { blockKey: 'B00001', text: 'Shared passage' },
        { blockKey: 'B00002', text: '1. Choice question' },
        { blockKey: 'B00003', text: '2. Choice question' },
        { blockKey: 'B00004', text: '3. Essay question' },
      ],
      {
        contexts: [{ id: 'CTX_1', title: 'Passage', firstBlock: 'B00001', lastBlock: 'B00001', type: 'TEXT' }],
        questions: [
          { id: 'Q_1', sourceNumber: '1', firstBlock: 'B00002', lastBlock: 'B00002', contextIds: ['CTX_1'], detectedType: 'SINGLE_CHOICE' },
          { id: 'Q_2', sourceNumber: '2', firstBlock: 'B00003', lastBlock: 'B00003', contextIds: ['CTX_1'], detectedType: 'SINGLE_CHOICE' },
        ],
        excluded: [{ firstBlock: 'B00004', lastBlock: 'B00004', sourceNumber: '3', detectedType: 'ESSAY', reason: 'Unsupported type' }],
        warnings: [],
      },
    );
    expect(issue).toBeNull();
  });
});
