import { OpenRouterQuestionImportClient } from './openrouter-question-import.client';

describe('OpenRouterQuestionImportClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends a flattened V3 extraction schema without oneOf', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
          usage: {},
        }),
      ),
    } as unknown as Response);
    const client = new OpenRouterQuestionImportClient({
      get: jest.fn().mockReturnValue({
        openRouterApiKey: 'test-key',
        questionImportModel: 'test-model',
        requestTimeoutMs: 1_000,
      }),
    } as any);

    await client.extractQuestionsV3({
      contexts: [],
      answerEvidence: [],
      questions: [
        {
          id: 'Q-1',
          firstBlock: 'B00001',
          lastBlock: 'B00001',
          text: 'What is 2 + 2?',
          contextIds: [],
          allowedEvidenceKeys: ['E-1'],
        },
      ],
    });

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0][1] as RequestInit).body),
    );
    const candidateSchema =
      request.response_format.json_schema.schema.properties.items.items;
    expect(JSON.stringify(candidateSchema)).not.toContain('oneOf');
    expect(candidateSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'body',
        'type',
        'options',
        'selectedOptionIndexes',
        'acceptedAnswers',
        'gradingRubric',
        'explanation',
        'confidence',
        'answerOrigin',
        'warnings',
        'citedEvidenceKeys',
      ],
    });
    expect(candidateSchema.properties.options.type).toEqual(['array', 'null']);
    expect(candidateSchema.properties.selectedOptionIndexes.type).toEqual([
      'array',
      'null',
    ]);
    expect(candidateSchema.properties.acceptedAnswers.type).toEqual([
      'array',
      'null',
    ]);
    expect(candidateSchema.properties.gradingRubric.type).toEqual([
      'string',
      'null',
    ]);
    expect(request.messages[1].content).toContain('SOURCE QUESTION ID: Q-1');
    expect(request.messages[1].content).toContain('ALLOWED EVIDENCE: E-1');
  });

  it('sends V4 crops as in-request data and keeps only batch-local media keys in the prompt', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
          usage: {},
        }),
      ),
    } as unknown as Response);
    const client = new OpenRouterQuestionImportClient({
      get: jest.fn().mockReturnValue({
        openRouterApiKey: 'test-key',
        questionImportModel: 'test-model',
        requestTimeoutMs: 1_000,
      }),
    } as any);

    await client.extractQuestionsV4(
      {
        contexts: [],
        answerEvidence: [],
        media: [
          {
            mediaKey: 'M0001',
            pageNumber: 2,
            type: 'DIAGRAM',
            description: 'graph',
            normalizedBounds: { left: 1 },
          },
        ],
        questions: [
          {
            id: 'Q-1',
            firstBlock: 'B00001',
            lastBlock: 'B00002',
            text: 'Choose.',
            contextIds: [],
            allowedEvidenceKeys: [],
          },
        ],
      },
      [{ mediaKey: 'M0001', mimeType: 'image/png', data: Buffer.from('crop') }],
    );

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0][1] as RequestInit).body),
    );
    const candidateSchema =
      request.response_format.json_schema.schema.properties.items.items;
    expect(candidateSchema.required).toEqual(
      expect.arrayContaining(['citedSourceBlockKeys', 'mediaAssignments']),
    );
    expect(request.messages[1].content[0].text).toContain('[M0001]');
    expect(request.messages[1].content[1].image_url.url).toBe(
      `data:image/png;base64,${Buffer.from('crop').toString('base64')}`,
    );
    expect(JSON.stringify(request.messages)).not.toContain('assetId');
  });

  it('uses compact layout and visual manifests for V3 segmentation without sending page images', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  contexts: [],
                  questions: [],
                  answerEvidence: [],
                  excluded: [],
                  skippedRanges: [],
                  warnings: [],
                }),
              },
            },
          ],
          usage: {},
        }),
      ),
    } as unknown as Response);
    const client = new OpenRouterQuestionImportClient({
      get: jest.fn().mockReturnValue({
        openRouterApiKey: 'test-key',
        questionImportModel: 'test-model',
        requestTimeoutMs: 1_000,
      }),
    } as any);

    await client.segmentSourceV3(
      [
        {
          key: 'B00001',
          text: 'Question text',
          pageNumber: 3,
          layout: [
            { kind: 'QUESTION_STEM', bounds: { top: 1 }, optionIndex: null },
          ],
        },
      ],
      undefined,
      [
        {
          mediaKey: 'M0001',
          pageNumber: 3,
          type: 'TABLE',
          normalizedBounds: { top: 10 },
          description: 'data table',
          readiness: 'READY',
        },
      ],
    );

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0][1] as RequestInit).body),
    );
    expect(request.messages[0].content).toContain(
      "Default every question's contextIds to []",
    );
    expect(request.messages[1].content).toContain('LAYOUT REFERENCES');
    expect(request.messages[1].content).toContain('[B00001; PAGE 3]');
    expect(request.messages[1].content).toContain('M0001');
    expect(typeof request.messages[1].content).toBe('string');
  });
});
