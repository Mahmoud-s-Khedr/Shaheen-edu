import { QuestionImportService } from './question-import.service';
import { Role } from '../../common/types/roles.enum';
import { QuestionImportWorker } from './question-import.worker';
import type { ImportedCandidateV7 } from './openrouter-question-import.client';

const media = {
  id: 'media',
  mediaKey: 'M1',
  pageNumber: 1,
  cropCompleteness: 'COMPLETE',
  normalizedBounds: { top: 100, bottom: 200, left: 100, right: 200 },
};
const source = {
  firstBlock: 'B00001',
  lastBlock: 'B00002',
  page: 1,
  contextIds: [],
  media: [media],
};
const assignment = {
  mediaKey: 'M1',
  owner: 'OPTION' as const,
  ownerReference: 'OPTION:0',
  placementAnchor: 'END',
  confidence: 0.9,
  reason: 'Option figure',
};
const candidate: ImportedCandidateV7 = {
  type: 'SINGLE_CHOICE',
  body: 'Choose the figure',
  options: [{ body: null }, { body: 'Text option' }],
  warnings: [],
  citedSourceBlockKeys: ['B00001'],
  mediaAssignments: [assignment],
};

function setup(conflicts: any[] = []) {
  let item: any;
  const requirements: any[] = [];
  const tx = {
    $executeRaw: jest.fn(),
    questionImportItem: {
      create: jest.fn(async ({ data }) => (item = { id: 'item', ...data })),
      update: jest.fn(async ({ data }) => (item = { ...item, ...data })),
    },
    questionImportMediaAssignment: {
      findMany: jest.fn().mockResolvedValue(conflicts),
      create: jest.fn(async ({ data }) => ({ id: 'assignment', ...data })),
    },
    questionImportVisualRequirement: {
      create: jest.fn(async ({ data }) => {
        requirements.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    ...tx,
    questionImportMedia: { findMany: jest.fn().mockResolvedValue([media]) },
    $transaction: jest.fn(async (fn) => fn(tx)),
  };
  const questions = {
    createImportedDraftWithClient: jest.fn(),
    createExtractedDraftWithClient: jest.fn(),
  };
  const worker = new QuestionImportWorker(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    questions as any,
    {} as any,
    {
      get: () => ({ requestTimeoutMs: 1000, pdfTranscriptionTimeoutMs: 1000 }),
    } as any,
    {} as any,
    {} as any,
  );
  const extract = (
    value: ImportedCandidateV7 = candidate,
    version = 'question-import-v7',
  ) =>
    worker['createItem'](
      { id: 'batch', schemaVersion: version },
      { id: 'chunk', sequence: 1 },
      1,
      value as any,
      source,
      version !== 'question-import-v7',
      true,
      version === 'question-import-v7',
    );
  return { extract, tx, requirements, questions, worker, prisma };
}

describe('v7 extraction crop selection', () => {
  it('sends the nearest 12 crops and keeps both media manifests consistent', async () => {
    const { worker, prisma } = setup();
    const rows = Array.from({ length: 13 }, (_, index) => ({
      mediaKey: `M${index + 1}`,
      pageNumber: 1,
      asset: { storageKey: `crop-${index + 1}`, mimeType: 'image/png' },
    }));
    prisma.questionImportMedia.findMany.mockResolvedValue(rows);
    const manifest = rows.map((row, index) => ({
      mediaKey: row.mediaKey,
      proximity: 13 - index,
    }));
    const download = jest.fn().mockResolvedValue(Buffer.from('crop'));
    const extractQuestionsV7 = jest.fn().mockResolvedValue({ items: [] });
    Object.assign(worker, {
      storage: { download },
      client: { extractQuestionsV7 },
    });

    await worker['extractV7'](
      { id: 'batch' },
      { media: manifest, questions: [{ pageNumbers: [1], media: manifest }] },
    );

    const [input, crops] = extractQuestionsV7.mock.calls[0];
    const expectedKeys = rows
      .slice(1)
      .reverse()
      .map((row) => row.mediaKey);
    expect(crops.map((crop: any) => crop.mediaKey)).toEqual(expectedKeys);
    expect(input.media.map((item: any) => item.mediaKey).sort()).toEqual(
      [...expectedKeys].sort(),
    );
    expect(input.questions[0].media).toEqual(input.media);
    expect(download).toHaveBeenCalledTimes(12);
    expect(download).toHaveBeenCalledWith('crop-13');
    expect(download).not.toHaveBeenCalledWith('crop-1');
  });
});

describe('v7 extraction visual review', () => {
  it('keeps image-only options reviewable and tracks their pending approval', async () => {
    const { extract, requirements, questions, tx } = setup();
    const item = await extract();
    expect(item).toMatchObject({
      status: 'REVIEW_REQUIRED',
      visualState: 'PENDING',
      answerContentValid: false,
    });
    expect(requirements).toEqual([
      expect.objectContaining({
        kind: 'OPTION_IMAGE_SET',
        optionIndexes: [0],
        resolutionState: 'PENDING',
      }),
    ]);
    expect(tx.questionImportMediaAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          exclusiveOwnershipKey: 'batch:media',
          status: 'PROPOSED',
        }),
      }),
    );
    expect(questions.createImportedDraftWithClient).not.toHaveBeenCalled();
    expect(questions.createExtractedDraftWithClient).not.toHaveBeenCalled();
    expect(item.normalizedOutput.options[0]).toEqual({ body: '' });
    expect(item.normalizedOutput).not.toHaveProperty('selectedOptionIndexes');
  });

  it('flags missing option images for correction instead of invalidating the candidate', async () => {
    const { extract, requirements } = setup();
    expect(await extract({ ...candidate, mediaAssignments: [] })).toMatchObject(
      {
        status: 'REVIEW_REQUIRED',
        visualState: 'UNRESOLVED',
        answerContentValid: false,
      },
    );
    expect(requirements[0]).toMatchObject({
      expectedCardinality: 1,
      optionIndexes: [0],
      resolutionState: 'UNRESOLVED',
    });
  });

  it('marks a competing crop claim ambiguous without dropping either candidate', async () => {
    const { extract, tx } = setup([{ mediaId: 'media' }]);
    expect(await extract()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      visualState: 'AMBIGUOUS',
    });
    expect(tx.questionImportMediaAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ exclusiveOwnershipKey: null }),
      }),
    );
  });

  it('does not require visuals for text-only candidates', async () => {
    const { extract, requirements } = setup();
    expect(
      await extract({
        ...candidate,
        options: [{ body: 'A' }, { body: 'B' }],
        mediaAssignments: [],
      }),
    ).toMatchObject({
      status: 'REVIEW_REQUIRED',
      visualState: 'NOT_REQUIRED',
      answerContentValid: true,
    });
    expect(requirements[0].kind).toBe('NONE');
  });

  it('still rejects structurally incomplete choice questions', async () => {
    const { extract } = setup();
    expect(
      await extract({
        ...candidate,
        options: [{ body: 'A' }],
        mediaAssignments: [],
      }),
    ).toMatchObject({ status: 'INVALID' });
  });

  it('keeps v6 visual requirements and proposed ownership behavior', async () => {
    const { extract, requirements } = setup();
    const legacy = {
      ...candidate,
      explanation: 'Answer explanation',
      selectedOptionIndexes: [0],
      answerOrigin: 'SOURCE_MARKED',
      citedEvidenceKeys: [],
      acceptedAnswers: [],
      gradingRubric: null,
      confidence: 1,
      structuredExplanation: {
        keywords: 'k',
        eliminationStrategy: 's',
        whyCorrect: 'w',
        generalRule: 'r',
        whatIf: 'i',
        commonMistakes: 'm',
      },
    };
    expect(await extract(legacy, 'question-import-v6')).toMatchObject({
      status: 'REVIEW_REQUIRED',
      visualState: 'PENDING',
    });
    expect(requirements[0].kind).toBe('OPTION_IMAGE_SET');
  });
});

it('resolves a v7 option-image requirement when the admin approves its assignment', async () => {
  const { extract, tx, requirements } = setup();
  const item = await extract();
  const approved = { ...assignment, status: 'APPROVED', media };
  const reviewTx = {
    ...tx,
    questionImportItem: {
      ...tx.questionImportItem,
      findFirst: jest.fn().mockResolvedValue({
        ...item,
        batch: { id: 'batch', schemaVersion: 'question-import-v7' },
        chunk: { text: JSON.stringify({ questions: [source] }) },
      }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(item),
    },
    questionImportMedia: { findMany: jest.fn().mockResolvedValue([media]) },
    questionImportMediaAssignment: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([approved]),
    },
    questionImportVisualRequirement: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          requirements.map((value, index) => ({ id: String(index), ...value })),
        ),
      update: jest.fn(),
    },
  };
  const service = new QuestionImportService(
    { $transaction: (fn: any) => fn(reviewTx) } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { get: () => ({ questionImportModel: 'test' }) } as any,
  );
  await service.updateItemMedia(
    { id: 'admin', role: Role.ADMIN, sessionId: 'test' },
    'batch',
    'item',
    {
      assignments: [{ ...assignment, status: 'APPROVED' } as any],
    },
  );
  expect(reviewTx.questionImportVisualRequirement.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        resolutionState: 'RESOLVED',
        unresolvedReason: null,
      }),
    }),
  );
  expect(tx.questionImportItem.update).toHaveBeenLastCalledWith({
    where: { id: 'item' },
    data: {
      visualState: 'RESOLVED',
      visualEvidenceVersion: expect.any(String),
      answerContentValid: true,
    },
  });
});
