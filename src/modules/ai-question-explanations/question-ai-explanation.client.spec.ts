import { QuestionAiExplanationClient } from './question-ai-explanation.client';

describe('QuestionAiExplanationClient', () => {
  const config = {
    get: jest.fn().mockReturnValue({
      openRouterApiKey: 'test-key',
      questionExplanationModel: 'test-model',
      requestTimeoutMs: 1_000,
    }),
  } as any;

  afterEach(() => jest.restoreAllMocks());

  it('requests a strict reusable six-part explanation and preserves grounded answer input', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        answer: { selectedOptionIndexes: [1], acceptedAnswers: null, gradingRubric: null }, confidence: 0.9, warnings: [], conflictWarning: null,
        structuredExplanation: { keywords: 'k', eliminationStrategy: 's', whyCorrect: 'r', generalRule: 'g', whatIf: 'w', commonMistakes: 'm' },
      }) } }], usage: { total_tokens: 7 } }),
    } as any);
    const client = new QuestionAiExplanationClient(config);

    const result = await client.generate({
      mode: 'GROUNDED', languageCode: 'ar', question: { body: 'سؤال' }, suppliedAnswer: { selectedOptionIndexes: [1] }, images: [],
    });

    expect(result.result.structuredExplanation.whyCorrect).toBe('r');
    const request = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(request.model).toBe('test-model');
    expect(request.provider).toEqual({ require_parameters: true, data_collection: 'deny' });
    expect(request.response_format.json_schema.schema.properties.structuredExplanation).toBeDefined();
  });
});
