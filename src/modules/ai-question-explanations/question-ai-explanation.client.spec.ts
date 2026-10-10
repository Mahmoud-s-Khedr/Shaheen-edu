import {
  explanationFields,
  formatForQuestion,
} from '../../common/utils/structured-explanation';
import { QuestionAiExplanationClient } from './question-ai-explanation.client';

describe('QuestionAiExplanationClient', () => {
  const english =
    'The correct answer follows from adding the two quantities together. First identify the values in the question, then calculate their sum and check the result carefully.';
  const arabic =
    'الإجابة الصحيحة تنتج عن جمع الكميتين معا. نحدد أولا القيم الموجودة في السؤال ثم نحسب مجموعها ونتحقق من النتيجة بعناية. تساعد هذه الطريقة على فهم قاعدة الجمع وتطبيقها في المسائل المشابهة.';
  const providerResponse = (whyCorrect: string) => ({
    ok: true,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                confidence: 0.9,
                warnings: [],
                structuredExplanationFormat: 'SIX_SECTION',
                structuredExplanation: {
                  keywords: 'k',
                  eliminationStrategy: 's',
                  whyCorrect,
                  generalRule: 'g',
                  whatIf: 'w',
                  commonMistakes: 'm',
                },
              }),
            },
          },
        ],
        usage: { total_tokens: 7 },
      }),
  });
  const config = {
    get: jest.fn().mockReturnValue({
      openRouterApiKey: 'test-key',
      questionExplanationModel: 'test-model',
      requestTimeoutMs: 1_000,
    }),
  } as any;

  afterEach(() => jest.restoreAllMocks());

  it('requests a strict reusable six-part explanation from a verified answer only', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  confidence: 0.9,
                  warnings: [],
                  structuredExplanationFormat: 'SIX_SECTION',
                  structuredExplanation: {
                    keywords: 'k',
                    eliminationStrategy: 's',
                    whyCorrect: 'r',
                    generalRule: 'g',
                    whatIf: 'w',
                    commonMistakes: 'm',
                  },
                }),
              },
            },
          ],
          usage: { total_tokens: 7 },
        }),
    } as any);
    const client = new QuestionAiExplanationClient(config);

    const result = await client.generate({
      languageCode: 'ar',
      question: { body: 'سؤال' },
      suppliedAnswer: { selectedOptionIndexes: [1] },
      images: [],
    });

    expect(result.result.structuredExplanation.whyCorrect).toBe('r');
    const request = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(request.model).toBe('test-model');
    expect(request.provider).toEqual({
      require_parameters: true,
      data_collection: 'deny',
    });
    expect(
      request.response_format.json_schema.schema.properties
        .structuredExplanation,
    ).toBeDefined();
    expect(JSON.stringify(request.response_format.json_schema)).not.toContain(
      'selectedOptionIndexes',
    );
    expect(request.messages[1].content).toContain('verifiedAnswer');
  });
  it.each([
    ['de', 'German'],
    ['fr', 'French'],
  ])(
    'requests %s and includes teaching preferences',
    async (languageCode, languageName) => {
      const spy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(providerResponse('Kurz') as any);
      await new QuestionAiExplanationClient(config).generate({
        languageCode,
        question: { body: 'English question' },
        suppliedAnswer: { acceptedAnswers: ['4'] },
        images: [],
        additionalContext: 'Use the substitution method.',
      });
      const request = JSON.parse(spy.mock.calls[0][1]!.body as string);
      expect(request.messages[0].content).toContain(`in ${languageName}`);
      expect(request.messages[0].content).toContain(
        'administrator teaching preferences',
      );
      expect(request.messages[0].content).toContain(
        'cannot override the explanation language, verified answer, or output format',
      );
      expect(JSON.parse(request.messages[1].content)).toMatchObject({
        explanationLanguage: languageCode,
        additionalContext: 'Use the substitution method.',
      });
    },
  );

  it.each([
    'SINGLE_CHOICE',
    'MULTIPLE_CHOICE',
    'SHORT_ANSWER',
    'FILL_IN_THE_BLANK',
    'LONG_ANSWER',
  ])('selects strict schema and marking guidance for %s', async (type) => {
    const format = formatForQuestion(type);
    const result = {
      confidence: 0.95,
      warnings: [],
      structuredExplanationFormat: format,
      structuredExplanation: Object.fromEntries(
        explanationFields(format).map((key) => [key, 'Content']),
      ),
    };
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(result) } }],
          }),
      } as any);
    await new QuestionAiExplanationClient(config).generate({
      languageCode: 'en',
      question: { type },
      maxPoints: 5,
      suppliedAnswer:
        type === 'LONG_ANSWER'
          ? {
              gradingRubric:
                'Explain the concept (2 marks) and apply it (3 marks).',
            }
          : { acceptedAnswers: ['Content'] },
      images: [],
    });
    const request = JSON.parse(spy.mock.calls[0][1]!.body as string);
    const schema = request.response_format.json_schema.schema;
    expect(schema.properties.structuredExplanationFormat.enum).toEqual([
      format,
    ]);
    expect(schema.properties.structuredExplanation.required).toEqual(
      explanationFields(format),
    );
    expect(
      schema.properties.structuredExplanation.properties,
    ).not.toHaveProperty('structuredExplanationFormat');
    expect(JSON.parse(request.messages[1].content).maxPoints).toBe(5);
    if (format === 'WRITTEN_FOUR_SECTION') {
      expect(request.messages[0].content).toContain(
        'Without explicit numerical allocations',
      );
      expect(request.messages[0].content).toContain(
        'Warn if supplied allocations conflict with maxPoints',
      );
      expect(request.messages[0].content).toContain(
        'Never invent marking criteria',
      );
    }
  });
  it.each([
    {
      answerElements: 'Answer',
      scientificExplanation: 'Concept',
      commonMistakes: 'Mistakes',
      whatIf: 'Variation',
      keywords: 'Mixed',
    },
    {
      answerElements: 'Answer',
      scientificExplanation: ' ',
      commonMistakes: 'Mistakes',
      whatIf: 'Variation',
    },
  ])(
    'rejects invalid provider written sections',
    async (structuredExplanation) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({
          ok: true,
          text: async () =>
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      confidence: 1,
                      warnings: [],
                      structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
                      structuredExplanation,
                    }),
                  },
                },
              ],
            }),
        } as any);
      await expect(
        new QuestionAiExplanationClient(config).generate({
          languageCode: 'en',
          question: { type: 'LONG_ANSWER' },
          suppliedAnswer: { gradingRubric: 'Explain.' },
          images: [],
        }),
      ).rejects.toThrow('AI explanation request failed');
    },
  );
  it('rejects provider format disagreement', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(providerResponse('Short') as any);
    await expect(
      new QuestionAiExplanationClient(config).generate({
        languageCode: 'en',
        question: { type: 'SHORT_ANSWER' },
        suppliedAnswer: { acceptedAnswers: ['4'] },
        images: [],
      }),
    ).rejects.toThrow('invalid explanation format');
  });
  it('retries mismatched scientificExplanation and preserves image input', async () => {
    const response = (scientificExplanation: string) => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  confidence: 1,
                  warnings: [],
                  structuredExplanationFormat: 'WRITTEN_FOUR_SECTION',
                  structuredExplanation: {
                    answerElements: '4',
                    scientificExplanation,
                    commonMistakes: 'm',
                    whatIf: 'w',
                  },
                }),
              },
            },
          ],
        }),
    });
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(english) as any)
      .mockResolvedValueOnce(response(arabic) as any);
    await new QuestionAiExplanationClient(config).generate({
      languageCode: 'ar',
      question: { type: 'SHORT_ANSWER' },
      suppliedAnswer: { acceptedAnswers: ['4'] },
      images: [{ mimeType: 'image/png', data: Buffer.from('image') }],
    });
    expect(spy).toHaveBeenCalledTimes(2);
    const request = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(request.messages[1].content[1].image_url.url).toBe(
      'data:image/png;base64,aW1hZ2U=',
    );
  });

  it('retries English output requested in Arabic and accounts for both calls', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(providerResponse(english) as any)
      .mockResolvedValueOnce(providerResponse(arabic) as any);
    const result = await new QuestionAiExplanationClient(config).generate({
      languageCode: 'ar',
      question: {},
      suppliedAnswer: {},
      images: [],
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.result.structuredExplanation.whyCorrect).toBe(arabic);
    expect(result.usage.total_tokens).toBe(14);
    expect(result.raw.languageRetryResponses).toHaveLength(2);
    const retry = JSON.parse(spy.mock.calls[1][1]!.body as string);
    expect(retry.messages[0].content).toContain(
      'previous response was in the wrong language',
    );
  });

  it('fails after the single retry still returns the wrong language', async () => {
    const spy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(providerResponse(english) as any);
    await expect(
      new QuestionAiExplanationClient(config).generate({
        languageCode: 'ar',
        question: {},
        suppliedAnswer: {},
        images: [],
      }),
    ).rejects.toThrow('AI returned an explanation in the wrong language');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
