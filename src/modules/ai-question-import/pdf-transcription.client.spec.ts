import { PdfTranscriptionClient } from './pdf-transcription.client';

describe('PdfTranscriptionClient', () => {
  afterEach(() => jest.restoreAllMocks());

  function client() {
    return new PdfTranscriptionClient({
      get: jest.fn().mockReturnValue({
        openRouterApiKey: 'test-key',
        pdfTranscriptionModel: 'primary-model',
        pdfTranscriptionFallbackModel: 'fallback-model',
        pdfTranscriptionTimeoutMs: 1_000,
      }),
    } as any);
  }

  function response(content: unknown) {
    return {
      ok: true,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  typeof content === 'string'
                    ? content
                    : JSON.stringify(content),
              },
            },
          ],
          usage: { total_tokens: 12 },
        }),
      ),
    } as unknown as Response;
  }

  it('normalizes omitted page arrays and drops malformed visual metadata without losing OCR text', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      response({
        content: 'Question text',
        confidence: 0.99,
        visualRegions: [
          {
            type: 'TABLE',
            bounds: { left: 10, top: 10, right: 5, bottom: 20 },
            confidence: 1,
            description: 'bad',
          },
        ],
        layoutEnvelopes: [
          {
            kind: 'TEXT',
            text: 'usable',
            bounds: { left: 1, top: 2, right: 10, bottom: 20 },
            optionIndex: null,
          },
        ],
      }),
    );

    const result = await client().transcribeImage(Buffer.from('image'));

    expect(result.page).toMatchObject({
      content: 'Question text',
      uncertainSpans: [],
      visualRegions: [],
      layoutEnvelopes: [expect.objectContaining({ text: 'usable' })],
    });
    expect(result.page.warnings).toEqual(
      expect.arrayContaining(['Dropped malformed visual region 1.']),
    );
  });

  it('retains the raw provider payload when JSON content is malformed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response('{not json'));

    await expect(
      client().transcribeImage(Buffer.from('image')),
    ).rejects.toMatchObject({
      message: 'OpenRouter returned invalid transcription JSON',
      rawResponse: expect.objectContaining({ choices: expect.any(Array) }),
    });
  });

  it('uses the selected fallback model and strict retry contract', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response({ content: 'text', confidence: 1 }));

    await client().transcribeImage(Buffer.from('image'), {
      mode: 'FALLBACK',
      model: 'fallback-model',
    });

    const request = JSON.parse(
      String((fetchSpy.mock.calls[0][1] as RequestInit).body),
    );
    expect(request.model).toBe('fallback-model');
    expect(request.messages[0].content).toContain('Do not omit any field');
  });
});
