import { QuestionImportChunkStatus } from '../../common/types/roles.enum';
import { QuestionImportWorker } from './question-import.worker';

const candidate = (body: string) => ({
  body,
  type: 'SINGLE_CHOICE' as const,
  explanation: {
    keywords: 'key',
    eliminationStrategy: 'remove wrong',
    whyCorrect: 'correct',
    generalRule: 'rule',
    whatIf: 'not applicable',
    commonMistakes: 'mistake',
  },
  answer: {
    selectedOptionIndexes: [0],
    confidence: 0.9,
    origin: 'EXPLICIT' as const,
  },
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
    pdfTranscriptionModel: 'test/pdf-model',
    pdfTranscriptionFallbackModel: 'test/fallback-model',
    pdfTranscriptionTimeoutMs: 120_000,
    segmentationSplitThresholdTokens: 120_000,
    segmentationChildTargetTokens: 12_000,
    extractionTargetTokens: 30_000,
    extractionMaxQuestions: 10,
    pdfSplitOverlapPages: 2,
  };

  function workerWith(overrides: Record<string, any> = {}) {
    const questionImportItem = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      update: jest.fn().mockResolvedValue({}),
    };
    const tx = { questionImportItem };
    const prisma = {
      questionImportChunk: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionImportItem,
      questionImportBatch: { update: jest.fn() },
      questionImportPage: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback: any) =>
        typeof callback === 'function' ? callback(tx) : Promise.all(callback),
      ),
      ...overrides,
    };
    const questions = {
      createImportedDraftWithClient: jest
        .fn()
        .mockResolvedValue({ id: 'new-question' }),
    };
    const client = { extractQuestions: jest.fn(), segmentSource: jest.fn() };
    const config = {
      get: jest.fn((key: string) =>
        key === 'ai' ? aiConfig : 'redis://localhost:6379',
      ),
    };
    const storage = { download: jest.fn() };
    const pdfRanges = {
      pageCount: jest.fn(),
      extract: jest.fn(),
      renderPage: jest.fn(),
    };
    const transcriber = { transcribeImage: jest.fn(), verifyImage: jest.fn() };
    const media = { materializePage: jest.fn().mockResolvedValue([]) };
    return {
      worker: new QuestionImportWorker(
        prisma as any,
        storage as any,
        {} as any,
        pdfRanges as any,
        transcriber as any,
        media as any,
        client as any,
        questions as any,
        { enqueue: jest.fn() } as any,
        config as any,
      ),
      prisma,
      tx,
      questions,
      client,
      storage,
      pdfRanges,
      transcriber,
      media,
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
            sourceNumber: '1',
            contextIds: [],
          },
          {
            firstBlock: 'B00002',
            lastBlock: 'B00002',
            text: 'Retryable question',
            sourceNumber: '2',
            contextIds: [],
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
        data: expect.objectContaining({
          status: QuestionImportChunkStatus.PROCESSING,
        }),
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
    expect(prisma.questionImportItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CREATED',
          questionId: 'new-question',
        }),
      }),
    );
    expect(prisma.questionImportChunk.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QuestionImportChunkStatus.COMPLETED,
        }),
      }),
    );
  });

  it('automatically leaves a failed first extraction attempt pending for one retry', async () => {
    const { worker, prisma, client } = workerWith();
    client.extractQuestions.mockRejectedValue(new Error('temporary provider failure'));

    await (worker as any).processChunk(
      { id: 'batch-1', createdById: 'admin-1' },
      { id: 'chunk-1', attemptCount: 0, text: JSON.stringify([{ text: 'Question' }]) },
    );

    expect(prisma.questionImportChunk.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'chunk-1' },
        data: expect.objectContaining({ status: QuestionImportChunkStatus.PENDING }),
      }),
    );
  });

  it('marks a chunk failed after its automatic retry is exhausted', async () => {
    const { worker, prisma, client } = workerWith();
    client.extractQuestions.mockRejectedValue(new Error('persistent provider failure'));

    await (worker as any).processChunk(
      { id: 'batch-1', createdById: 'admin-1' },
      { id: 'chunk-1', attemptCount: 1, text: JSON.stringify([{ text: 'Question' }]) },
    );

    expect(prisma.questionImportChunk.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'chunk-1' },
        data: expect.objectContaining({ status: QuestionImportChunkStatus.FAILED }),
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

  it('stores raw page content and a normalized canonical transcription', async () => {
    const { worker, prisma, storage, pdfRanges, transcriber, media } =
      workerWith();
    const content = '  السؤال\u00a0الأول\r\nأ.\tالاختيار الأول  ';
    storage.download.mockResolvedValue(Buffer.from('pdf'));
    pdfRanges.pageCount.mockResolvedValue(3);
    pdfRanges.renderPage.mockResolvedValue(Buffer.from('page-3'));
    transcriber.transcribeImage.mockResolvedValue({
      page: { content, confidence: 0.99, uncertainSpans: [], warnings: [] },
      raw: { response: true },
      usage: { tokens: 1 },
    });
    prisma.questionImportPage.findMany
      .mockResolvedValueOnce([
        { pageNumber: 1, status: 'AI_TRANSCRIBED' },
        { pageNumber: 2, status: 'AI_TRANSCRIBED' },
        { pageNumber: 3, status: 'PENDING' },
      ])
      .mockResolvedValueOnce([
        {
          pageNumber: 1,
          status: 'AI_TRANSCRIBED',
          canonicalText: 'الغلاف',
          confidence: 0.99,
        },
        {
          pageNumber: 2,
          status: 'AI_TRANSCRIBED',
          canonicalText: 'الفهرس',
          confidence: 0.99,
        },
        {
          pageNumber: 3,
          status: 'AI_TRANSCRIBED',
          canonicalText: 'السؤال الأول\nأ. الاختيار الأول',
          confidence: 0.99,
        },
      ]);

    const result = await (worker as any).transcribePdf({
      id: 'batch-1',
      sourceAsset: { storageKey: 'asset-1', filename: 'exam.pdf' },
    });

    expect(prisma.questionImportPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId_pageNumber: { batchId: 'batch-1', pageNumber: 3 } },
        data: expect.objectContaining({
          status: 'AI_TRANSCRIBED',
          aiText: content,
          canonicalText: 'السؤال الأول\nأ. الاختيار الأول',
        }),
      }),
    );
    expect(media.materializePage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'batch-1' }),
      3,
      Buffer.from('page-3'),
      [],
      { response: true },
    );
    expect(result).toEqual({
      text: '[Page 1]\nالغلاف\n\n[Page 2]\nالفهرس\n\n[Page 3]\nالسؤال الأول\nأ. الاختيار الأول',
      metadata: expect.objectContaining({
        format: 'VISUAL_PDF_OCR',
        pages: expect.arrayContaining([
          expect.objectContaining({ page: 1, confidence: 0.99, lineCount: 1 }),
          expect.objectContaining({ page: 3, confidence: 0.99, lineCount: 2 }),
        ]),
      }),
    });
  });

  it('continues with retained text from review-required pages without waiting for admin approval', async () => {
    const { worker, prisma, storage, pdfRanges, transcriber } = workerWith();
    storage.download.mockResolvedValue(Buffer.from('pdf'));
    pdfRanges.pageCount.mockResolvedValue(2);
    pdfRanges.renderPage.mockResolvedValue(Buffer.from('page-1'));
    transcriber.transcribeImage.mockResolvedValue({
      page: {
        content: 'صفحة تمت إعادة المحاولة',
        confidence: 0.99,
        uncertainSpans: [],
        warnings: [],
      },
      raw: {},
      usage: {},
    });
    prisma.questionImportPage.findMany
      .mockResolvedValueOnce([
        {
          pageNumber: 1,
          status: 'PENDING',
          rawProviderResponse: {
            attempts: [{ mode: 'PRIMARY', outcome: 'FAILED' }],
          },
        },
        {
          pageNumber: 2,
          status: 'REVIEW_REQUIRED',
          aiText: 'دليل محفوظ',
          warnings: ['غير واضح'],
        },
      ])
      .mockResolvedValueOnce([
        {
          pageNumber: 1,
          status: 'AI_TRANSCRIBED',
          canonicalText: 'صفحة تمت إعادة المحاولة',
          confidence: 0.99,
        },
        {
          pageNumber: 2,
          status: 'REVIEW_REQUIRED',
          canonicalText: 'دليل محفوظ',
          confidence: 0.5,
        },
      ]);

    const result = await (worker as any).transcribePdf({
      id: 'batch-1',
      sourceAsset: { storageKey: 'asset-1' },
    });

    expect(result.text).toContain('[Page 2]\nدليل محفوظ');
    expect(result.metadata.unresolvedPages).toEqual([2]);

    expect(pdfRanges.renderPage).toHaveBeenCalledTimes(1);
    expect(pdfRanges.renderPage).toHaveBeenCalledWith(
      Buffer.from('pdf'),
      1,
      350,
    );
    expect(prisma.questionImportPage.update).toHaveBeenCalledTimes(1);
    expect(prisma.questionImportPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId_pageNumber: { batchId: 'batch-1', pageNumber: 1 } },
        data: expect.objectContaining({
          rawProviderResponse: expect.objectContaining({
            attempts: expect.arrayContaining([
              expect.objectContaining({ mode: 'PRIMARY', outcome: 'FAILED' }),
            ]),
          }),
        }),
      }),
    );
  });

  it('continues after a page OCR failure when another page has usable text', async () => {
    const { worker, prisma, storage, pdfRanges, transcriber } = workerWith();
    storage.download.mockResolvedValue(Buffer.from('pdf'));
    pdfRanges.pageCount.mockResolvedValue(2);
    pdfRanges.renderPage.mockResolvedValue(Buffer.from('page'));
    transcriber.transcribeImage
      .mockRejectedValueOnce(
        Object.assign(new Error('provider schema failure'), {
          rawResponse: { provider: 'bad' },
          usage: { tokens: 1 },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('provider schema failure'), {
          rawResponse: { provider: 'bad' },
          usage: { tokens: 2 },
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('fallback schema failure'), {
          rawResponse: { provider: 'fallback' },
          usage: { tokens: 3 },
        }),
      )
      .mockResolvedValueOnce({
        page: {
          content: 'Page two',
          confidence: 0.99,
          uncertainSpans: [],
          warnings: [],
          visualRegions: [],
          layoutEnvelopes: [],
        },
        raw: { provider: 'good' },
        usage: { tokens: 4 },
      });
    prisma.questionImportPage.findMany
      .mockResolvedValueOnce([
        { pageNumber: 1, status: 'PENDING' },
        { pageNumber: 2, status: 'PENDING' },
      ])
      .mockResolvedValueOnce([
        {
          pageNumber: 1,
          status: 'REVIEW_REQUIRED',
          canonicalText: null,
          confidence: null,
        },
        {
          pageNumber: 2,
          status: 'AI_TRANSCRIBED',
          canonicalText: 'Page two',
          confidence: 0.99,
        },
      ]);

    const result = await (worker as any).transcribePdf({
      id: 'batch-1',
      sourceAsset: { storageKey: 'asset-1' },
    });

    expect(result.text).toBe('[Page 2]\nPage two');
    expect(result.metadata.omittedPages).toEqual([1]);

    expect(transcriber.transcribeImage).toHaveBeenCalledTimes(4);
    expect(pdfRanges.renderPage).toHaveBeenNthCalledWith(
      1,
      Buffer.from('pdf'),
      1,
      350,
    );
    expect(pdfRanges.renderPage).toHaveBeenNthCalledWith(
      2,
      Buffer.from('pdf'),
      1,
      250,
    );
    expect(pdfRanges.renderPage).toHaveBeenNthCalledWith(
      3,
      Buffer.from('pdf'),
      1,
      250,
    );
    expect(prisma.questionImportPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId_pageNumber: { batchId: 'batch-1', pageNumber: 1 } },
        data: expect.objectContaining({
          status: 'REVIEW_REQUIRED',
          rawProviderResponse: expect.objectContaining({
            attempts: expect.any(Array),
          }),
        }),
      }),
    );
    expect(prisma.questionImportPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId_pageNumber: { batchId: 'batch-1', pageNumber: 2 } },
        data: expect.objectContaining({ status: 'AI_TRANSCRIBED' }),
      }),
    );
  });

  it('verifies OCR warnings but does not use a 0.98 confidence gate', async () => {
    const { worker, prisma, storage, pdfRanges, transcriber } = workerWith();
    storage.download.mockResolvedValue(Buffer.from('pdf'));
    pdfRanges.pageCount.mockResolvedValue(5);
    pdfRanges.renderPage.mockResolvedValue(Buffer.from('page-5'));
    transcriber.transcribeImage.mockResolvedValue({
      page: {
        content: 'السؤال ١\nأ. خيار واحد\nج. خيار اثنان',
        confidence: 0.95,
        uncertainSpans: [],
        warnings: ['Option labels are unclear'],
      },
      raw: { first: true },
      usage: {},
    });
    transcriber.verifyImage.mockResolvedValue({
      page: {
        content: 'السؤال ١\nأ. خيار واحد\nب. خيار اثنان',
        confidence: 0.96,
        uncertainSpans: [],
        warnings: [],
      },
      raw: { verified: true },
      usage: {},
    });
    const initialPages = [1, 2, 3, 4, 5].map((pageNumber) => ({
      pageNumber,
      status: pageNumber === 5 ? 'PENDING' : 'AI_TRANSCRIBED',
    }));
    const finalPages = initialPages.map((page) =>
      page.pageNumber === 5
        ? {
            ...page,
            status: 'AI_TRANSCRIBED',
            canonicalText: 'السؤال ١\nأ. خيار واحد\nب. خيار اثنان',
            confidence: 0.96,
          }
        : { ...page, canonicalText: 'س', confidence: 1 },
    );
    prisma.questionImportPage.findMany
      .mockResolvedValueOnce(initialPages)
      .mockResolvedValueOnce(finalPages);

    await (worker as any).transcribePdf({
      id: 'batch-1',
      sourceAsset: { storageKey: 'asset-1', filename: 'exam.pdf' },
    });

    expect(transcriber.verifyImage).toHaveBeenCalledTimes(1);
    expect(prisma.questionImportPage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'AI_TRANSCRIBED',
          verifiedAt: expect.any(Date),
          initialAiText: 'السؤال ١\nأ. خيار واحد\nج. خيار اثنان',
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
              id: 'Q1',
              sourceNumber: '1',
              contextIds: [],
              detectedType: 'SINGLE_CHOICE',
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

  it('keeps a question together when its options continue on the next PDF page block', () => {
    const { worker } = workerWith();

    const chunks = (worker as any).extractionChunks(
      'batch-1',
      [
        { blockKey: 'B00001', text: '[Page 24]\n12. اختر الإجابة الصحيحة:' },
        {
          blockKey: 'B00002',
          text: '[Page 25]\nأ. الاختيار الأول\nب. الاختيار الثاني',
        },
      ],
      {
        contexts: [],
        questions: [
          {
            id: 'Q12',
            sourceNumber: '12',
            firstBlock: 'B00001',
            lastBlock: 'B00002',
            contextIds: [],
            detectedType: 'SINGLE_CHOICE',
            page: 24,
          },
        ],
        excluded: [],
        warnings: [],
      },
      new Map(),
    );

    expect(chunks).toHaveLength(1);
    const payload = JSON.parse(chunks[0].text);
    expect(payload.questions).toEqual([
      expect.objectContaining({
        firstBlock: 'B00001',
        lastBlock: 'B00002',
        text: expect.stringContaining('[Page 24]'),
      }),
    ]);
    expect(payload.questions[0].text).toContain('[Page 25]');
  });

  it('splits oversized page-marked text with overlapping pages and distinct ownership', () => {
    const { worker } = workerWith();
    (worker as any).config.segmentationChildTargetTokens = 40;
    (worker as any).config.pdfSplitOverlapPages = 1;
    const source = [1, 2, 3, 4]
      .map((page) => `[Page ${page}]\n${'x'.repeat(40)}`)
      .join('\n\n');

    const children = (worker as any).pageChildren(source);

    expect(children).toHaveLength(2);
    expect(children[0].scope).toMatchObject({
      corePageStart: 1,
      corePageEnd: 2,
      includedPageEnd: 3,
    });
    expect(children[1].scope).toMatchObject({
      corePageStart: 3,
      corePageEnd: 4,
      includedPageStart: 2,
    });
  });

  it('keeps sources at the token threshold whole and splits only above it', () => {
    const { worker } = workerWith();

    expect((worker as any).needsPageSplit('x'.repeat(480_000))).toBe(false);
    expect((worker as any).needsPageSplit('x'.repeat(480_001))).toBe(true);
  });

  it('retains an overlapping question only in the child that owns its stem page', () => {
    const { worker } = workerWith();
    const result = (worker as any).limitToOwnedPages(
      [
        { blockKey: 'B00001', text: '[Page 10]' },
        { blockKey: 'B00002', text: '10. Stem on page ten' },
        { blockKey: 'B00003', text: '[Page 11]' },
        { blockKey: 'B00004', text: 'choices continue here' },
      ],
      {
        contexts: [],
        questions: [
          {
            id: 'Q10',
            sourceNumber: '10',
            firstBlock: 'B00002',
            lastBlock: 'B00004',
            contextIds: [],
            detectedType: 'SINGLE_CHOICE',
            page: null,
          },
        ],
        excluded: [],
        warnings: [],
      },
      { corePageStart: 11, corePageEnd: 20 },
    );

    expect(result.questions).toEqual([]);
  });

  it('accepts a child containing only skipped cover or index content', () => {
    const { worker } = workerWith();
    expect(
      (worker as any).validateSegmentation(
        [
          { blockKey: 'B00001', text: '[Page 1]' },
          { blockKey: 'B00002', text: 'Contents' },
        ],
        {
          contexts: [],
          questions: [],
          excluded: [],
          skippedRanges: [
            {
              firstBlock: 'B00001',
              lastBlock: 'B00002',
              reason: 'TABLE_OF_CONTENTS',
            },
          ],
          warnings: [],
        },
      ),
    ).toBeNull();
  });

  it('rejects a segmentation response that says it omitted part of the source', () => {
    const { worker } = workerWith();

    expect(
      (worker as any).validateSegmentation(
        [{ blockKey: 'B00001', text: '[Page 1]' }],
        {
          contexts: [],
          questions: [],
          excluded: [],
          skippedRanges: [],
          warnings: [
            'The supplied source continues beyond the returned page segment.',
          ],
        },
      ),
    ).toBe(
      'AI reported incomplete source coverage; reduce the segmentation range and retry.',
    );
  });

  it('deduplicates a shared context before applying the extraction token budget', () => {
    const { worker } = workerWith();
    const chunks = (worker as any).extractionChunks(
      'batch-1',
      [
        { blockKey: 'B00001', text: 'Shared passage' },
        { blockKey: 'B00002', text: '1. First question' },
        { blockKey: 'B00003', text: '2. Second question' },
      ],
      {
        contexts: [
          {
            id: 'C1',
            title: 'Passage',
            firstBlock: 'B00001',
            lastBlock: 'B00001',
            type: 'TEXT',
          },
        ],
        questions: [
          {
            id: 'Q1',
            sourceNumber: '1',
            firstBlock: 'B00002',
            lastBlock: 'B00002',
            contextIds: ['C1'],
            detectedType: 'SINGLE_CHOICE',
          },
          {
            id: 'Q2',
            sourceNumber: '2',
            firstBlock: 'B00003',
            lastBlock: 'B00003',
            contextIds: ['C1'],
            detectedType: 'SINGLE_CHOICE',
          },
        ],
        excluded: [],
        skippedRanges: [],
        warnings: [],
      },
      new Map([['C1', 'context-1']]),
    );
    const payload = JSON.parse(chunks[0].text);
    expect(payload.contexts).toHaveLength(1);
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[0].contextIds).toEqual(['context-1']);
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
                id: 'Q1',
                sourceNumber: '1',
                contextIds: [],
                detectedType: 'SINGLE_CHOICE',
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
          excluded: [
            {
              firstBlock: 'B00001',
              lastBlock: 'B00001',
              sourceNumber: '1',
              detectedType: 'ESSAY',
              reason: 'Unsupported type',
            },
          ],
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
        contexts: [
          {
            id: 'CTX_1',
            title: 'Passage',
            firstBlock: 'B00001',
            lastBlock: 'B00001',
            type: 'TEXT',
          },
        ],
        questions: [
          {
            id: 'Q_1',
            sourceNumber: '1',
            firstBlock: 'B00002',
            lastBlock: 'B00002',
            contextIds: ['CTX_1'],
            detectedType: 'SINGLE_CHOICE',
          },
          {
            id: 'Q_2',
            sourceNumber: '2',
            firstBlock: 'B00003',
            lastBlock: 'B00003',
            contextIds: ['CTX_1'],
            detectedType: 'SINGLE_CHOICE',
          },
        ],
        excluded: [
          {
            firstBlock: 'B00004',
            lastBlock: 'B00004',
            sourceNumber: '3',
            detectedType: 'ESSAY',
            reason: 'Unsupported type',
          },
        ],
        warnings: [],
      },
    );
    expect(issue).toBeNull();
  });

  it('removes a context that intersects Candidate 1 instead of attaching B00055–B00059 to it', () => {
    const { worker } = workerWith();
    const blocks = Array.from({ length: 6 }, (_, index) => ({
      blockKey: `B${String(index + 55).padStart(5, '0')}`,
      text:
        index === 0
          ? 'Candidate 1: choose the correct answer'
          : `Option ${index}`,
    }));
    const normalized = (worker as any).normalizeContexts(blocks, {
      contexts: [
        {
          id: 'bad',
          title: null,
          firstBlock: 'B00055',
          lastBlock: 'B00059',
          type: 'TEXT',
        },
      ],
      questions: [
        {
          id: 'Q1',
          sourceNumber: '1',
          firstBlock: 'B00055',
          lastBlock: 'B00057',
          contextIds: ['bad'],
          detectedType: 'SINGLE_CHOICE',
        },
        {
          id: 'Q2',
          sourceNumber: '2',
          firstBlock: 'B00058',
          lastBlock: 'B00059',
          contextIds: ['bad'],
          detectedType: 'SINGLE_CHOICE',
        },
      ],
      excluded: [],
      skippedRanges: [],
      warnings: [],
    });
    expect(normalized.result.contexts).toEqual([]);
    expect(
      normalized.result.questions.map((question: any) => question.contextIds),
    ).toEqual([[], []]);
    expect(normalized.diagnostics).toContain(
      'CONTEXT_REJECTED:bad:OVERLAPS_QUESTION_OR_EXCLUDED_RANGE',
    );
  });

  it('keeps a heading in section and rejects it as a context for independent questions', () => {
    const { worker } = workerWith();
    const blocks = [
      { blockKey: 'B00001', text: 'Lesson: Cell biology' },
      ...Array.from({ length: 23 }, (_, index) => ({
        blockKey: `B${String(index + 2).padStart(5, '0')}`,
        text: `${index + 1}. Independent question`,
      })),
    ];
    const normalized = (worker as any).normalizeContexts(blocks, {
      contexts: [
        {
          id: 'heading',
          title: 'Cell biology',
          firstBlock: 'B00001',
          lastBlock: 'B00001',
          type: 'TEXT',
        },
      ],
      questions: blocks.slice(1).map((block, index) => ({
        id: `Q${index + 1}`,
        sourceNumber: String(index + 1),
        firstBlock: block.blockKey,
        lastBlock: block.blockKey,
        contextIds: ['heading'],
        detectedType: 'SINGLE_CHOICE',
        section: 'Cell biology',
      })),
      excluded: [],
      skippedRanges: [],
      warnings: [],
    });
    expect(normalized.result.contexts).toEqual([]);
    expect(normalized.result.questions).toHaveLength(23);
    expect(
      normalized.result.questions.every(
        (question: any) =>
          question.section === 'Cell biology' &&
          question.contextIds.length === 0,
      ),
    ).toBe(true);
  });

  it('retains a bounded passage shared by two questions but not a one-question stimulus', () => {
    const { worker } = workerWith();
    const blocks = [
      { blockKey: 'B00001', text: 'A passage about cells.' },
      { blockKey: 'B00002', text: '1. First question' },
      { blockKey: 'B00003', text: '2. Second question' },
      { blockKey: 'B00004', text: 'A separate passage.' },
      { blockKey: 'B00005', text: '3. Third question' },
    ];
    const normalized = (worker as any).normalizeContexts(blocks, {
      contexts: [
        {
          id: 'shared',
          title: null,
          firstBlock: 'B00001',
          lastBlock: 'B00001',
          type: 'TEXT',
        },
        {
          id: 'single',
          title: null,
          firstBlock: 'B00004',
          lastBlock: 'B00004',
          type: 'TEXT',
        },
      ],
      questions: [
        {
          id: 'Q1',
          sourceNumber: '1',
          firstBlock: 'B00002',
          lastBlock: 'B00002',
          contextIds: ['shared'],
          detectedType: 'SINGLE_CHOICE',
        },
        {
          id: 'Q2',
          sourceNumber: '2',
          firstBlock: 'B00003',
          lastBlock: 'B00003',
          contextIds: ['shared'],
          detectedType: 'SINGLE_CHOICE',
        },
        {
          id: 'Q3',
          sourceNumber: '3',
          firstBlock: 'B00005',
          lastBlock: 'B00005',
          contextIds: ['single'],
          detectedType: 'SINGLE_CHOICE',
        },
      ],
      excluded: [],
      skippedRanges: [],
      warnings: [],
    });
    expect(
      normalized.result.contexts.map((context: any) => context.id),
    ).toEqual(['CTX_TEXT_B00001_B00001']);
    expect(normalized.result.questions[2]).toMatchObject({ contextIds: [] });
    expect(normalized.diagnostics).toContain(
      'CONTEXT_REJECTED:single:FEWER_THAN_TWO_CONSUMERS',
    );
  });

  it('rejects overlapping contexts and question-layout content before extraction chunks are built', () => {
    const { worker } = workerWith();
    const blocks = [
      {
        blockKey: 'B00001',
        text: 'Table data',
        assignment: { layoutReferences: [{ kind: 'TABLE', bounds: {} }] },
      },
      {
        blockKey: 'B00002',
        text: 'Question stem',
        assignment: {
          layoutReferences: [{ kind: 'QUESTION_STEM', bounds: {} }],
        },
      },
      { blockKey: 'B00003', text: 'Another question' },
      { blockKey: 'B00004', text: 'Final question' },
    ];
    const normalized = (worker as any).normalizeContexts(blocks, {
      contexts: [
        {
          id: 'a',
          title: null,
          firstBlock: 'B00001',
          lastBlock: 'B00002',
          type: 'TABLE',
        },
        {
          id: 'b',
          title: null,
          firstBlock: 'B00001',
          lastBlock: 'B00001',
          type: 'TABLE',
        },
      ],
      questions: [
        {
          id: 'Q1',
          sourceNumber: '1',
          firstBlock: 'B00003',
          lastBlock: 'B00003',
          contextIds: ['a', 'b'],
          detectedType: 'SINGLE_CHOICE',
        },
        {
          id: 'Q2',
          sourceNumber: '2',
          firstBlock: 'B00004',
          lastBlock: 'B00004',
          contextIds: ['a', 'b'],
          detectedType: 'SINGLE_CHOICE',
        },
      ],
      excluded: [],
      skippedRanges: [],
      warnings: [],
    });
    expect(normalized.result.contexts).toEqual([]);
    const chunks = (worker as any).extractionChunks(
      'batch-1',
      blocks,
      normalized.result,
      new Map(),
      [],
      true,
    );
    expect(JSON.parse(chunks[0].text).contexts).toEqual([]);
  });

  it('uses ordered page-local layout alignment without reusing repeated option labels', () => {
    const { worker } = workerWith();
    const parts = [
      { text: '[Page 1]', sourceLocator: { page: 1 } },
      { text: 'A. repeated option', sourceLocator: { page: 1, line: 1 } },
      { text: 'A. repeated option', sourceLocator: { page: 1, line: 2 } },
    ];
    const aligned = (worker as any).alignLayoutReferences(parts, [
      {
        pageNumber: 1,
        layoutEnvelopes: [
          {
            kind: 'OPTION',
            text: 'A. repeated option',
            optionIndex: 0,
            bounds: { left: 700, top: 100 },
          },
          {
            kind: 'OPTION',
            text: 'A. repeated option',
            optionIndex: 1,
            bounds: { left: 300, top: 100 },
          },
        ],
      },
    ]);
    expect(aligned.get(1)[0].optionIndex).toBe(0);
    expect(aligned.get(2)[0].optionIndex).toBe(1);
  });

  it('creates a source-marked short-answer draft only when its cited evidence is relevant', async () => {
    const { worker, questions, tx } = workerWith();
    await (worker as any).createV3Item(
      {
        id: 'batch-1',
        createdById: 'admin-1',
        bankId: 'bank-1',
        sourceId: 'source-1',
        courseId: 'course-1',
        placements: [],
        model: 'test',
      },
      { id: 'chunk-1', sequence: 1 },
      1,
      {
        body: 'Name the capital.',
        type: 'SHORT_ANSWER',
        acceptedAnswers: ['Cairo'],
        explanation: 'The marked key gives Cairo.',
        confidence: 0.98,
        answerOrigin: 'SOURCE_MARKED',
        warnings: [],
        citedEvidenceKeys: ['E001'],
      },
      {
        firstBlock: 'B1',
        lastBlock: 'B1',
        sourceNumber: '1',
        contextIds: [],
        answerEvidence: [{ evidenceKey: 'E001' }],
      },
    );
    expect(questions.createImportedDraftWithClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'SHORT_ANSWER',
        acceptedAnswers: ['Cairo'],
        answerOrigin: 'SOURCE_MARKED',
      }),
      tx,
    );
  });

  it('passes each V3 question its stable id and evidence allowlist', () => {
    const { worker } = workerWith();
    const input = (worker as any).extractionInput([
      {
        id: 'Q-1',
        firstBlock: 'B1',
        lastBlock: 'B1',
        text: 'Name the capital.',
        sourceNumber: '1',
        contextIds: [],
        contexts: [],
        locator: {},
        answerEvidence: [
          { evidenceKey: 'E001', questionIds: ['Q-1'], text: 'Cairo' },
        ],
      },
    ]);

    expect(input.questions).toEqual([
      expect.objectContaining({ id: 'Q-1', allowedEvidenceKeys: ['E001'] }),
    ]);
  });

  it('supplies question geometry and visual proximity to V5 extraction', () => {
    const { worker } = workerWith();
    const input = (worker as any).extractionInput(
      [
        {
          id: 'Q-1',
          firstBlock: 'B1',
          lastBlock: 'B2',
          text: 'Question text',
          sourceNumber: '1',
          page: 3,
          pageNumbers: [3],
          envelope: { left: 600, top: 600, right: 950, bottom: 760 },
          contextIds: [],
          contexts: [],
          locator: {},
          answerEvidence: [],
        },
      ],
      [
        { mediaKey: 'M-near', pageNumber: 3, type: 'DIAGRAM', description: 'near', normalizedBounds: { left: 50, top: 620, right: 400, bottom: 760 } },
        { mediaKey: 'M-far', pageNumber: 3, type: 'DIAGRAM', description: 'far', normalizedBounds: { left: 50, top: 100, right: 400, bottom: 240 } },
      ],
      true,
    );
    expect(input.questions[0]).toEqual(
      expect.objectContaining({
        envelope: expect.objectContaining({ top: 600, bottom: 760 }),
      }),
    );
    expect(input.media.find((item: any) => item.mediaKey === 'M-near').proximity).toBeLessThan(
      input.media.find((item: any) => item.mediaKey === 'M-far').proximity,
    );
  });

  it('keeps inferred and incomplete typed answers reviewable instead of creating drafts', async () => {
    const { worker, questions, tx } = workerWith();
    await (worker as any).createV3Item(
      {
        id: 'batch-1',
        createdById: 'admin-1',
        bankId: 'bank-1',
        sourceId: 'source-1',
        courseId: 'course-1',
        placements: [],
      },
      { id: 'chunk-1', sequence: 1 },
      1,
      {
        body: 'Explain the result.',
        type: 'LONG_ANSWER',
        gradingRubric: '',
        explanation: 'No rubric was supplied.',
        confidence: 0.99,
        answerOrigin: 'AI_INFERRED',
        warnings: [],
        citedEvidenceKeys: [],
      },
      {
        firstBlock: 'B1',
        lastBlock: 'B1',
        sourceNumber: '1',
        contextIds: [],
        answerEvidence: [],
      },
    );
    expect(questions.createImportedDraftWithClient).not.toHaveBeenCalled();
    expect(tx.questionImportItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REVIEW_REQUIRED' }),
      }),
    );
  });
});
