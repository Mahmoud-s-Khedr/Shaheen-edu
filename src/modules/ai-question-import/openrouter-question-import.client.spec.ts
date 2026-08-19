import { OpenRouterQuestionImportClient } from './openrouter-question-import.client';

describe('OpenRouterQuestionImportClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends a flattened V3 extraction schema without oneOf', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [] }) } }], usage: {} })),
    } as unknown as Response);
    const client = new OpenRouterQuestionImportClient({
      get: jest.fn().mockReturnValue({ openRouterApiKey: 'test-key', questionImportModel: 'test-model', requestTimeoutMs: 1_000 }),
    } as any);

    await client.extractQuestionsV3({
      contexts: [],
      answerEvidence: [],
      questions: [{ id: 'Q-1', firstBlock: 'B00001', lastBlock: 'B00001', text: 'What is 2 + 2?', contextIds: [], allowedEvidenceKeys: ['E-1'] }],
    });

    const request = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const candidateSchema = request.response_format.json_schema.schema.properties.items.items;
    expect(JSON.stringify(candidateSchema)).not.toContain('oneOf');
    expect(candidateSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['body', 'type', 'options', 'selectedOptionIndexes', 'acceptedAnswers', 'gradingRubric', 'explanation', 'confidence', 'answerOrigin', 'warnings', 'citedEvidenceKeys'],
    });
    expect(candidateSchema.properties.options.type).toEqual(['array', 'null']);
    expect(candidateSchema.properties.selectedOptionIndexes.type).toEqual(['array', 'null']);
    expect(candidateSchema.properties.acceptedAnswers.type).toEqual(['array', 'null']);
    expect(candidateSchema.properties.gradingRubric.type).toEqual(['string', 'null']);
    expect(request.messages[1].content).toContain('SOURCE QUESTION ID: Q-1');
    expect(request.messages[1].content).toContain('ALLOWED EVIDENCE: E-1');
  });
});
