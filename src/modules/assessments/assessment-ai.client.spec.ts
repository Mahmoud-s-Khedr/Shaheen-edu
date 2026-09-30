import {
  AssessmentAiClient,
  AssessmentAiRequestException,
} from './assessment-ai.client';

describe('AssessmentAiClient', () => {
  const aiConfig = {
    openRouterApiKey: 'test-key',
    quizPlanningModel: 'openai/gpt-5.6-luna',
    answerGradingModel: 'openai/gpt-5.6-luna',
    requestTimeoutMs: 1_000,
  };

  function client() {
    return new AssessmentAiClient({
      get: jest.fn().mockReturnValue(aiConfig),
    } as any);
  }

  afterEach(() => jest.restoreAllMocks());

  it('uses a strict dynamic JSON schema for quiz selection', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"rationale":"Balanced coverage","questionIds":["q1","q2"]}',
              },
            },
          ],
          usage: { total_tokens: 10 },
        }),
      ),
    } as any);

    await expect(
      client().planQuiz({
        prompt: 'Create a balanced quiz',
        candidates: [
          { id: 'q1', body: 'One', placements: [] },
          { id: 'q2', body: 'Two', placements: [] },
        ],
        questionCount: 2,
      }),
    ).resolves.toMatchObject({ result: { questionIds: ['q1', 'q2'] } });

    const init = fetchSpy.mock.calls[0]?.[1];
    if (!init || typeof init === 'string' || typeof init.body !== 'string')
      throw new Error('Expected a JSON request body');
    const body = JSON.parse(init.body) as unknown;
    expect(body).toEqual({
      model: 'openai/gpt-5.6-luna',
      provider: { require_parameters: true, data_collection: 'deny' },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'quiz_plan',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['rationale', 'questionIds'],
            properties: {
              rationale: { type: 'string' },
              questionIds: {
                type: 'array',
                items: { type: 'string', enum: ['q1', 'q2'] },
              },
            },
          },
        },
      },
      messages: expect.any(Array),
    });
  });

  it('keeps a provider response with invalid JSON available to the run audit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: 'not-json' } }],
          usage: { total_tokens: 10 },
        }),
      ),
    } as any);

    let caught: unknown;
    try {
      await client().planQuiz({
        prompt: 'Create a quiz',
        candidates: [{ id: 'q1', body: 'One', placements: [] }],
        questionCount: 1,
      });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AssessmentAiRequestException);
    const providerError = caught as AssessmentAiRequestException;
    expect(providerError.message).toBe('AI assessment returned invalid JSON');
    expect(providerError.evidence).toEqual({
      model: 'openai/gpt-5.6-luna',
      rawResponse: {
        choices: [{ message: { content: 'not-json' } }],
        usage: { total_tokens: 10 },
      },
      usage: { total_tokens: 10 },
    });
  });
});
