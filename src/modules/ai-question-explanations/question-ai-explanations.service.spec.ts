import { BadRequestException } from '@nestjs/common';
import { QuestionType, Role } from '../../common/types/roles.enum';
import { QuestionAiExplanationsService } from './question-ai-explanations.service';

describe('QuestionAiExplanationsService answer validation', () => {
  const service = new QuestionAiExplanationsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  // Stored review runs also pass through this validator when applied.
  it.each([123, null, {}, ' '])(
    'rejects malformed written answer %j without throwing a TypeError',
    (answer) => {
      expect(() =>
        service['validAnswer'](QuestionType.SHORT_ANSWER, {
          acceptedAnswers: [answer],
        }),
      ).toThrow(
        new BadRequestException(
          'acceptedAnswers must contain only non-blank text answers',
        ),
      );
    },
  );

  it.each([-1, 0.5, '0', null, {}])(
    'rejects malformed choice index %j',
    (index) => {
      expect(() =>
        service['validAnswer'](QuestionType.SINGLE_CHOICE, {
          selectedOptionIndexes: [index],
        }),
      ).toThrow(
        new BadRequestException(
          'selectedOptionIndexes must contain only non-negative whole numbers',
        ),
      );
    },
  );

  it('preserves trimming and deduplication of valid written answers', () => {
    expect(
      service['validAnswer'](QuestionType.SHORT_ANSWER, {
        acceptedAnswers: [' 42 ', '42'],
      }),
    ).toEqual({
      selectedOptionIndexes: null,
      acceptedAnswers: ['42'],
      gradingRubric: null,
    });
  });
});

describe('Verified-answer explanation generation', () => {
  const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
  function setup(type: QuestionType) {
    const question = {
      id: 'question',
      type,
      body: 'Question',
      status: 'DRAFT',
      options: [
        { body: 'A', isCorrect: false, contentBlocks: [] },
        { body: 'B', isCorrect: false, contentBlocks: [] },
      ],
      contentBlocks: [],
      contexts: [],
    };
    const explanation = {
      keywords: 'k',
      eliminationStrategy: 's',
      whyCorrect: 'w',
      generalRule: 'r',
      whatIf: 'i',
      commonMistakes: 'm',
    };
    const client = {
      generate: jest.fn().mockResolvedValue({
        result: {
          structuredExplanation: explanation,
          confidence: 1,
          warnings: [],
        },
        model: 'test',
        raw: {},
        usage: {},
      }),
    };
    const prisma = {
      question: {
        findUnique: jest.fn().mockResolvedValue(question),
        update: jest.fn(),
      },
      questionAiExplanationRun: {
        create: jest.fn(async ({ data }) => ({ id: 'run', ...data })),
      },
    };
    const service = new QuestionAiExplanationsService(
      prisma as any,
      { record: jest.fn() } as any,
      {} as any,
      client as any,
    );
    return { service, client, prisma };
  }

  it.each([
    [QuestionType.SINGLE_CHOICE, { selectedOptionIndexes: [0, 1] }],
    [QuestionType.SINGLE_CHOICE, { selectedOptionIndexes: [2] }],
    [QuestionType.MULTIPLE_CHOICE, { selectedOptionIndexes: [0] }],
    [QuestionType.MULTIPLE_CHOICE, { selectedOptionIndexes: [0, 0] }],
    [QuestionType.MULTIPLE_CHOICE, { selectedOptionIndexes: [0, 2] }],
    [QuestionType.SHORT_ANSWER, { acceptedAnswers: [' '] }],
    [QuestionType.FILL_IN_THE_BLANK, { selectedOptionIndexes: [0] }],
    [QuestionType.LONG_ANSWER, { gradingRubric: ' ' }],
  ])(
    'rejects invalid %s answers before calling AI: %j',
    async (type, suppliedAnswer) => {
      const { service, client, prisma } = setup(type as QuestionType);
      await expect(
        service.create(actor, 'question', { suppliedAnswer }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.generate).not.toHaveBeenCalled();
      expect(prisma.questionAiExplanationRun.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [QuestionType.SINGLE_CHOICE, { selectedOptionIndexes: [1] }],
    [QuestionType.MULTIPLE_CHOICE, { selectedOptionIndexes: [0, 1] }],
    [QuestionType.SHORT_ANSWER, { acceptedAnswers: ['42'] }],
    [QuestionType.FILL_IN_THE_BLANK, { acceptedAnswers: ['42'] }],
    [QuestionType.LONG_ANSWER, { gradingRubric: 'Explain the mechanism.' }],
  ])(
    'generates an explanation from the supplied %s answer without updating the question',
    async (type, suppliedAnswer) => {
      const { service, client, prisma } = setup(type as QuestionType);
      const run = await service.create(actor, 'question', { suppliedAnswer });
      expect(client.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          suppliedAnswer: expect.objectContaining(suppliedAnswer),
        }),
      );
      expect(run).toMatchObject({
        mode: 'GROUNDED',
        suppliedAnswer: expect.objectContaining(suppliedAnswer),
        proposedAnswer: expect.objectContaining(suppliedAnswer),
      });
      expect(prisma.question.update).not.toHaveBeenCalled();
    },
  );
});

describe('Reviewing edited explanations', () => {
  const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
  const original = {
    keywords: 'Original keywords',
    eliminationStrategy: 'Original strategy',
    whyCorrect: 'Original reasoning',
    generalRule: 'Original rule',
    whatIf: 'Original variation',
    commonMistakes: 'Original mistakes',
  };
  const edited = { ...original, whyCorrect: 'Two plus two makes four.' };

  function setup(status = 'DRAFT', matchesAnswer = false) {
    const source = {
      id: 'question',
      type: QuestionType.SHORT_ANSWER,
      status,
      body: 'What is 2 + 2?',
      options: [],
      contentBlocks: [],
      contexts: [],
      placements: [],
      assets: [],
      acceptedAnswers: matchesAnswer ? ['4'] : [],
    };
    const run = {
      id: 'run',
      questionId: source.id,
      status: 'PENDING_REVIEW',
      mode: 'GROUNDED',
      proposedAnswer: { acceptedAnswers: ['4'] },
      structuredExplanation: original,
      languageCode: 'en',
      model: 'test',
      confidence: 0.9,
      warnings: ['AI warning'],
      sourceFingerprint: '',
      rawResponse: { original },
    };
    const tx = {
      question: {
        update: jest.fn().mockResolvedValue(source),
        create: jest
          .fn()
          .mockResolvedValue({ ...source, id: 'replacement', status: 'DRAFT' }),
      },
      questionAiExplanationRun: { update: jest.fn() },
    };
    const applied = {
      ...source,
      id: status === 'PUBLISHED' ? 'replacement' : source.id,
      status: 'DRAFT',
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValue(applied),
      },
      questionAiExplanationRun: { findFirst: jest.fn().mockResolvedValue(run) },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new QuestionAiExplanationsService(
      prisma as any,
      audit as any,
      {} as any,
      {} as any,
    );
    run.sourceFingerprint = service['fingerprint'](service['snapshot'](source));
    jest.spyOn(service, 'get').mockResolvedValue(run as any);
    const apply = (extra = {}) =>
      service.apply(actor, source.id, run.id, {
        applyAnswer: true,
        applyExplanation: true,
        ...extra,
      });
    return { apply, tx, prisma, audit, run };
  }

  it.each(['DRAFT', 'PUBLISHED'])(
    'applies edited text to a %s and retains original AI output',
    async (status) => {
      const { apply, tx, audit, run } = setup(status);
      const result = await apply({
        structuredExplanation: {
          ...edited,
          whyCorrect: `  ${edited.whyCorrect}  `,
        },
      });
      const id = status === 'PUBLISHED' ? 'replacement' : 'question';
      expect(result.id).toBe(id);
      const data = tx.question.update.mock.calls.find(
        ([arg]) => arg.data.structuredExplanation,
      )![0].data;
      expect(data.explanation).toBe(Object.values(edited).join('\n\n'));
      for (const branch of ['create', 'update']) {
        expect(data.structuredExplanation.upsert[branch]).toMatchObject({
          ...edited,
          origin: 'HUMAN',
          model: null,
          confidence: null,
          reviewedById: actor.id,
        });
      }
      expect(tx.question.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id },
          data: expect.objectContaining({
            acceptedAnswers: ['4'],
            answerOrigin: 'HUMAN_REVIEWED',
          }),
        }),
      );
      expect(tx.questionAiExplanationRun.update).toHaveBeenCalledWith({
        where: { id: 'run' },
        data: expect.objectContaining({
          status: 'APPLIED',
          appliedQuestionId: id,
        }),
      });
      expect(
        tx.questionAiExplanationRun.update.mock.calls[0][0].data,
      ).not.toHaveProperty('structuredExplanation');
      expect(run.structuredExplanation).toEqual(original);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ reviewedExplanation: edited }),
        }),
      );
    },
  );

  it('still applies the generated explanation when edits are omitted', async () => {
    const { apply, tx } = setup();
    await apply();
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          explanation: Object.values(original).join('\n\n'),
          structuredExplanation: {
            upsert: {
              create: expect.objectContaining({
                ...original,
                origin: 'AI',
                model: 'test',
                confidence: 0.9,
              }),
              update: expect.objectContaining({ ...original, origin: 'AI' }),
            },
          },
        }),
      }),
    );
  });

  it.each([null, { whyCorrect: 'Partial' }, { ...edited, whyCorrect: '   ' }])(
    'rejects invalid edits before any writes: %j',
    async (structuredExplanation) => {
      const { apply, prisma } = setup();
      await expect(apply({ structuredExplanation })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects edits when applying only the answer', async () => {
    const { apply, prisma } = setup();
    await expect(
      apply({ applyExplanation: false, structuredExplanation: edited }),
    ).rejects.toThrow(
      'Edited explanation requires applyExplanation to be true',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let edits bypass stale-run protection', async () => {
    const { apply, prisma, run } = setup();
    run.sourceFingerprint = 'old';
    await expect(apply({ structuredExplanation: edited })).rejects.toThrow(
      'Question changed after this AI run',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let edits bypass the answer match requirement', async () => {
    const { apply, prisma } = setup();
    await expect(
      apply({ applyAnswer: false, structuredExplanation: edited }),
    ).rejects.toThrow(
      'An explanation can be applied alone only when its answer matches the question',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows explanation-only edits when the verified answer already matches', async () => {
    const { apply, tx } = setup('DRAFT', true);
    await apply({ applyAnswer: false, structuredExplanation: edited });
    expect(tx.question.update).toHaveBeenCalledTimes(1);
    expect(tx.question.update.mock.calls[0][0].data.explanation).toContain(
      edited.whyCorrect,
    );
  });
});

describe('Applied AI re-answer response', () => {
  const actor = { id: 'admin', role: Role.ADMIN, sessionId: 'test' };
  const generated = {
    keywords: 'Keywords',
    eliminationStrategy: 'Eliminate distractors',
    whyCorrect: 'Original reasoning',
    generalRule: 'General rule',
    whatIf: 'Variation',
    commonMistakes: 'Common mistake',
  };
  const reviewed = { ...generated, whyCorrect: 'Reviewed reasoning' };

  function setup(status: 'DRAFT' | 'PUBLISHED') {
    const source = {
      id: 'question',
      bankId: 'bank',
      sourceId: 'source',
      courseId: 'course',
      type: QuestionType.SINGLE_CHOICE,
      status,
      body: 'Which option is correct?',
      explanation: null,
      maxPoints: 1,
      acceptedAnswers: null,
      gradingRubric: null,
      answerOrigin: 'EXPLICIT',
      options: [
        {
          id: 'option-a',
          body: 'A',
          isCorrect: false,
          sortOrder: 0,
          contentBlocks: [],
        },
        {
          id: 'option-b',
          body: 'B',
          isCorrect: false,
          sortOrder: 1,
          contentBlocks: [],
        },
      ],
      contentBlocks: [],
      contexts: [],
      placements: [],
      assets: [],
      videoLink: null,
      structuredExplanation: null,
    };
    const appliedId = status === 'PUBLISHED' ? 'replacement' : source.id;
    const persisted = {
      ...source,
      id: appliedId,
      status: 'DRAFT',
      answerOrigin: 'HUMAN_REVIEWED',
      options: source.options.map((option, index) => ({
        ...option,
        isCorrect: index === 1,
      })),
      structuredExplanation: {
        ...reviewed,
        origin: 'HUMAN',
        answerOrigin: 'EXPLICIT',
      },
    };
    const run = {
      id: 'run',
      questionId: source.id,
      status: 'PENDING_REVIEW',
      mode: 'GROUNDED',
      proposedAnswer: { selectedOptionIndexes: [1] },
      structuredExplanation: generated,
      languageCode: 'en',
      model: 'test',
      confidence: 0.9,
      warnings: [],
      sourceFingerprint: '',
    };
    const tx = {
      question: {
        create: jest
          .fn()
          .mockResolvedValue({ ...source, id: appliedId, status: 'DRAFT' }),
        update: jest.fn(),
      },
      questionOption: {
        findMany: jest.fn().mockResolvedValue(source.options),
        updateMany: jest.fn(),
      },
      questionAiExplanationRun: { update: jest.fn() },
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValue(persisted),
      },
      questionAiExplanationRun: { findFirst: jest.fn().mockResolvedValue(run) },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new QuestionAiExplanationsService(
      prisma as any,
      audit as any,
      {} as any,
      {} as any,
    );
    run.sourceFingerprint = service['fingerprint'](service['snapshot'](source));
    jest.spyOn(service, 'get').mockResolvedValue(run as any);

    return {
      apply: () =>
        service.apply(actor, source.id, run.id, {
          applyAnswer: true,
          applyExplanation: true,
          structuredExplanation: reviewed,
        }),
      prisma,
      appliedId,
    };
  }

  it.each(['DRAFT', 'PUBLISHED'] as const)(
    'returns the persisted %s question detail after applying a reviewed answer and explanation',
    async (status) => {
      const { apply, prisma, appliedId } = setup(status);

      const result = await apply();

      expect(result).toMatchObject({
        id: appliedId,
        answerOrigin: 'HUMAN_REVIEWED',
        options: [
          { id: 'option-a', isCorrect: false },
          { id: 'option-b', isCorrect: true },
        ],
        structuredExplanation: expect.objectContaining({
          ...reviewed,
          origin: 'HUMAN',
        }),
      });
      expect(prisma.question.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: appliedId } }),
      );
    },
  );
});
