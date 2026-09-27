import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApplyAiQuestionExplanationRunDto,
  CreateAiQuestionExplanationRunDto,
} from './question-ai-explanation.dto';

describe('CreateAiQuestionExplanationRunDto', () => {
  it.each([
    { acceptedAnswers: [123] },
    { selectedOptionIndexes: [-1] },
    { selectedOptionIndexes: [0.5] },
    { gradingRubric: 123 },
  ])('validates the nested supplied answer: %j', async (suppliedAnswer) => {
    const dto = plainToInstance(CreateAiQuestionExplanationRunDto, {
      suppliedAnswer,
    });
    const errors = await validate(dto);
    expect(errors).toEqual([
      expect.objectContaining({
        property: 'suppliedAnswer',
        children: expect.arrayContaining([
          expect.objectContaining({ property: Object.keys(suppliedAnswer)[0] }),
        ]),
      }),
    ]);
  });

  it('accepts a valid nested answer', async () => {
    const dto = plainToInstance(CreateAiQuestionExplanationRunDto, {
      suppliedAnswer: { acceptedAnswers: ['42'] },
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('requires a verified supplied answer', async () => {
    expect(
      await validate(plainToInstance(CreateAiQuestionExplanationRunDto, {})),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'suppliedAnswer' }),
      ]),
    );
  });
});

describe('ApplyAiQuestionExplanationRunDto', () => {
  const explanation = {
    keywords: 'Addition',
    eliminationStrategy: 'Count both groups.',
    whyCorrect: 'Two plus two makes four.',
    generalRule: 'Combine quantities.',
    whatIf: 'One more makes five.',
    commonMistakes: 'Count each object once.',
  };
  const check = (extra = {}) =>
    validate(
      plainToInstance(ApplyAiQuestionExplanationRunDto, {
        applyAnswer: true,
        applyExplanation: true,
        ...extra,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );

  it('accepts approval with or without a complete edited explanation', async () => {
    expect(await check()).toEqual([]);
    expect(await check({ structuredExplanation: explanation })).toEqual([]);
  });

  it.each([
    null,
    'text',
    [],
    { whyCorrect: 'Only one section' },
    { ...explanation, whyCorrect: 42 },
    { ...explanation, whyCorrect: 'x'.repeat(10001) },
    { ...explanation, confidence: 1 },
  ])(
    'rejects malformed edited explanation %#',
    async (structuredExplanation) => {
      expect(await check({ structuredExplanation })).not.toHaveLength(0);
    },
  );
});
