import {
  formatForQuestion,
  QuestionExplanationFormat,
} from '../../common/utils/structured-explanation';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
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
      maxPoints: 5,
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
          structuredExplanationFormat: formatForQuestion(type),
          structuredExplanation:
            formatForQuestion(type) ===
            QuestionExplanationFormat.WRITTEN_FOUR_SECTION
              ? {
                  answerElements: '42',
                  scientificExplanation: 'Reason',
                  commonMistakes: 'Mistakes',
                  whatIf: 'Change',
                }
              : explanation,
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
    return { service, client, prisma, question };
  }

  it.each(['ar', 'en', 'de', 'fr'] as const)(
    'uses and retains explicit %s language',
    async (explanationLanguage) => {
      const { service, client } = setup(QuestionType.SHORT_ANSWER);
      const run = await service.create(actor, 'question', {
        suppliedAnswer: { acceptedAnswers: ['42'] },
        explanationLanguage,
        additionalContext: 'Use the substitution method.',
      });
      expect(client.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          languageCode: explanationLanguage,
          additionalContext: 'Use the substitution method.',
        }),
      );
      expect(run.languageCode).toBe(explanationLanguage);
      expect(run.promptVersion).toBe('question-verified-answer-explanation-v4');
    },
  );

  it.each([undefined, 8])(
    'generates with proposed marks %s without saving the question',
    async (maxPoints) => {
      const { service, client, prisma, question } = setup(
        QuestionType.SHORT_ANSWER,
      );
      const run = await service.create(actor, question.id, {
        suppliedAnswer: { acceptedAnswers: ['42'] },
        maxPoints,
      });
      const effective = maxPoints ?? 5;
      expect(client.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxPoints: effective,
          question: expect.objectContaining({ maxPoints: effective }),
        }),
      );
      expect(run.proposedMaxPoints).toBe(effective);
      expect(run.questionSnapshot).toMatchObject({ maxPoints: 5 });
      expect(run.sourceFingerprint).toBe(
        service['fingerprint'](service['snapshot'](question)),
      );
      expect(prisma.question.update).not.toHaveBeenCalled();
      expect(question.maxPoints).toBe(5);
    },
  );

  it('retains proposed marks on failed generation', async () => {
    const { service, client, prisma } = setup(QuestionType.LONG_ANSWER);
    client.generate.mockRejectedValueOnce(new Error('Provider failed'));
    await expect(
      service.create(actor, 'question', {
        suppliedAnswer: { gradingRubric: 'Explain.' },
        maxPoints: 8,
      }),
    ).rejects.toThrow('Provider failed');
    expect(prisma.questionAiExplanationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', proposedMaxPoints: 8 }),
    });
    expect(prisma.question.update).not.toHaveBeenCalled();
  });

  it('retains text detection when no language or metadata is supplied', async () => {
    const { service } = setup(QuestionType.SHORT_ANSWER);
    const run = await service.create(actor, 'question', {
      suppliedAnswer: { acceptedAnswers: ['42'] },
    });
    expect(run.languageCode).toBe('en');
  });

  it('detects French from question block metadata', () => {
    const { service } = setup(QuestionType.SHORT_ANSWER);
    expect(
      service['language']({
        body: 'Question',
        contentBlocks: [{ languageCode: 'fr', text: 'English terminology' }],
      }),
    ).toBe('fr');
  });

  it.each([
    {
      contentBlocks: [
        { languageCode: 'ar', text: 'English scientific terminology' },
      ],
    },
    {
      options: [
        {
          body: 'English',
          contentBlocks: [{ languageCode: 'ar', text: 'English terminology' }],
        },
      ],
    },
    {
      contexts: [
        { languageCode: 'ar', body: 'English passage', contentBlocks: [] },
      ],
    },
    {
      options: [
        {
          body: 'A',
          contentBlocks: [
            {
              text: 'هذا هو نص الاختيار باللغة العربية وهو يتضمن شرحا تفصيليا للإجابة',
            },
          ],
        },
      ],
    },
  ])('detects language from metadata and option blocks: %j', (extra) => {
    const { service } = setup(QuestionType.SHORT_ANSWER);
    expect(service['language']({ body: 'Question', ...extra })).toBe('ar');
  });

  it('prefers question block metadata over shared-context metadata', () => {
    const { service } = setup(QuestionType.SHORT_ANSWER);
    expect(
      service['language']({
        contentBlocks: [{ languageCode: 'de' }],
        contexts: [{ languageCode: 'en', contentBlocks: [] }],
      }),
    ).toBe('de');
  });

  it('falls back to question text when metadata is tied', () => {
    const { service } = setup(QuestionType.SHORT_ANSWER);
    expect(
      service['language']({
        body: 'هذا السؤال مكتوب باللغة العربية',
        contentBlocks: [{ languageCode: 'ar' }, { languageCode: 'en' }],
        contexts: [{ languageCode: 'en' }],
      }),
    ).toBe('ar');
  });

  it('retains a failed run with the selected language when generation fails', async () => {
    const { service, client, prisma } = setup(QuestionType.SHORT_ANSWER);
    client.generate.mockRejectedValue(
      new ServiceUnavailableException(
        'AI returned an explanation in the wrong language',
      ),
    );
    await expect(
      service.create(actor, 'question', {
        suppliedAnswer: { acceptedAnswers: ['42'] },
        explanationLanguage: 'ar',
      }),
    ).rejects.toThrow('AI returned an explanation in the wrong language');
    expect(prisma.questionAiExplanationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        languageCode: 'ar',
        promptVersion: 'question-verified-answer-explanation-v4',
      }),
    });
    expect(prisma.question.update).not.toHaveBeenCalled();
  });

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
      maxPoints: 5,
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
      questionExplanation: { deleteMany: jest.fn() },
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
    run.sourceFingerprint = service['fingerprint'](
      service['snapshot'](source, true),
    );
    jest.spyOn(service, 'get').mockResolvedValue(run as any);
    const apply = (extra = {}) =>
      service.apply(actor, source.id, run.id, {
        applyAnswer: true,
        applyExplanation: true,
        ...extra,
      });
    return { apply, tx, prisma, audit, run, source, service };
  }

  it.each(['DRAFT', 'PUBLISHED'])(
    'saves proposed marks on combined approval for %s',
    async (status) => {
      const { apply, run, tx, audit } = setup(status);
      Object.assign(run, { proposedMaxPoints: 8 });
      await apply();
      const id = status === 'PUBLISHED' ? 'replacement' : 'question';
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id },
        data: { maxPoints: 8, updatedById: actor.id },
      });
      if (status === 'PUBLISHED')
        expect(tx.question.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ maxPoints: 8 }),
          }),
        );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            proposedMaxPoints: 8,
            appliedMaxPoints: 8,
          }),
        }),
      );
    },
  );

  it('saves marks on answer-only approval and clears the previous explanation', async () => {
    const { apply, run, tx } = setup();
    Object.assign(run, { proposedMaxPoints: 8 });
    await apply({ applyExplanation: false });
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'question' },
      data: { maxPoints: 8, updatedById: actor.id },
    });
    expect(tx.questionExplanation.deleteMany).toHaveBeenCalledWith({
      where: { questionId: 'question' },
    });
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'question' },
      data: { explanation: null, updatedById: actor.id },
    });
  });

  it('applies proposed marks to choice answers too', async () => {
    const { apply, run, tx, source, service } = setup();
    Object.assign(source, {
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { id: 'option', body: 'Four', isCorrect: false, contentBlocks: [] },
      ],
    });
    Object.assign(run, {
      proposedMaxPoints: 3,
      proposedAnswer: { selectedOptionIndexes: [0] },
    });
    run.sourceFingerprint = service['fingerprint'](
      service['snapshot'](source, true),
    );
    const questionOption = {
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue(source.options),
    };
    Object.assign(tx, { questionOption });
    await apply();
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'question' },
      data: { maxPoints: 3, updatedById: actor.id },
    });
    expect(questionOption.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['option'] } },
      data: { isCorrect: true },
    });
  });

  it('rejects explanation-only approval when proposed marks differ', async () => {
    const { apply, run, prisma } = setup('DRAFT', true);
    Object.assign(run, { proposedMaxPoints: 8 });
    await expect(apply({ applyAnswer: false })).rejects.toThrow(
      'approve the answer too',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([5, null])(
    'allows explanation-only approval with matching or legacy marks %s',
    async (proposedMaxPoints) => {
      const { apply, run, tx } = setup('DRAFT', true);
      Object.assign(run, { proposedMaxPoints });
      await apply({ applyAnswer: false });
      expect(
        tx.question.update.mock.calls.some(
          ([arg]) => arg.data.maxPoints !== undefined,
        ),
      ).toBe(false);
    },
  );

  it('rejects new runs when the saved marks changed after generation', async () => {
    const { apply, run, source, service, prisma } = setup();
    Object.assign(run, {
      proposedMaxPoints: 8,
      promptVersion: 'question-verified-answer-explanation-v4',
    });
    run.sourceFingerprint = service['fingerprint'](service['snapshot'](source));
    source.maxPoints = 6;
    await expect(apply()).rejects.toThrow('Question changed after this AI run');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a run without saving its proposed marks', async () => {
    const { run, service, prisma, audit } = setup();
    Object.assign(run, { proposedMaxPoints: 8 });
    Object.assign(prisma.questionAiExplanationRun, {
      update: jest.fn().mockResolvedValue({ ...run, status: 'REJECTED' }),
    });
    const result = await service.reject(actor, 'question', 'run', {
      note: 'Discard',
    });
    expect(result.proposedMaxPoints).toBe(8);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { proposedMaxPoints: 8 } }),
    );
  });

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

  it.each(['DRAFT', 'PUBLISHED'])(
    'retains four-section format and human audit evidence on %s edits',
    async (status) => {
      const { apply, tx, run, audit } = setup(status, true);
      (run as any).structuredExplanationFormat =
        QuestionExplanationFormat.WRITTEN_FOUR_SECTION;
      const written = {
        answerElements: '4',
        scientificExplanation: 'Add two and two.',
        commonMistakes: 'Do not multiply.',
        whatIf: 'Changing an addend changes the sum.',
      };
      (run as any).structuredExplanation = written;
      await apply({
        applyAnswer: false,
        structuredExplanation: written,
        structuredExplanationFormat:
          QuestionExplanationFormat.WRITTEN_FOUR_SECTION,
      });
      const data = tx.question.update.mock.calls.find(
        ([arg]) => arg.data.structuredExplanation,
      )![0].data;
      expect(data.structuredExplanation.upsert.update).toMatchObject({
        ...written,
        structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
        keywords: null,
        whyCorrect: null,
        origin: 'HUMAN',
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ reviewedExplanation: written }),
        }),
      );
    },
  );
  it('rejects an edit format that differs from the stored run', async () => {
    const { apply, prisma } = setup();
    await expect(
      apply({
        structuredExplanation: edited,
        structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
      }),
    ).rejects.toThrow('must match the stored run');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('includes changed marks in new-run fingerprints and preserves legacy calculations', async () => {
    const { apply, run, source, service, prisma } = setup();
    (run as any).promptVersion = 'question-verified-answer-explanation-v4';
    (source as any).maxPoints = 2;
    run.sourceFingerprint = service['fingerprint'](service['snapshot'](source));
    (source as any).maxPoints = 3;
    await expect(apply()).rejects.toThrow('Question changed after this AI run');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(service['snapshot'](source, true)).not.toHaveProperty('maxPoints');
  });

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
    run.sourceFingerprint = service['fingerprint'](
      service['snapshot'](source, true),
    );
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
