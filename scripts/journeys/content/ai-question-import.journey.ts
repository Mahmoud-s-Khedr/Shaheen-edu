import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

/** CONTENT-019 — Admin AI-question-import queue and review API contract. */
export const aiQuestionImportJourney: JourneyDefinition = {
  id: 'CONTENT-019',
  name: 'AI question import queue and review contract',
  category: 'content',
  dependsOn: ['CONTENT-006'],
  async run({ clients, context, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);
    let importId = '';

    await step(
      'Queueing a raw-text import with a valid question target',
      async () => {
        const created = await admin.request<any>(
          'POST',
          '/admin/ai/question-imports',
          {
            bankId: String(context.created.questionBanks.at(-1)),
            sourceId: String(context.created.questionSources.at(-1)),
            courseId,
            placements: [{ chapterId }],
            rawText: [
              '1. Which synthetic answer is correct?',
              'A. First answer',
              'B. Second answer',
              'Answer: B',
            ].join('\n'),
          },
        );
        expectStatus(created, 201);
        importId = created.body.id;
        context.created.questionImports.push(importId);
        assert(
          created.body.inputType === 'RAW_TEXT' &&
            created.body.status === 'QUEUED' &&
            created.body.bankId === context.created.questionBanks.at(-1) &&
            !('rawText' in created.body) &&
            !('normalizedText' in created.body),
          'A queued import summary must retain its target but never expose source text',
        );
      },
    );

    await step(
      'Reading the queued import, retained source endpoint, and empty candidate list',
      async () => {
        const listed = await admin.request<any>(
          'GET',
          '/admin/ai/question-imports?status=QUEUED',
        );
        expectStatus(listed, 200);
        assert(
          listed.body.data.some((item: any) => item.id === importId),
          'Queued imports must be filterable and paginated',
        );
        const detail = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}`,
        );
        expectStatus(detail, 200);
        assert(
          detail.body.id === importId &&
            Array.isArray(detail.body.chunks) &&
            Array.isArray(detail.body.sourceBlocks),
          'Import detail must expose queue diagnostics',
        );
        const source = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/source-text`,
        );
        expectStatus(source, 200);
        assert(
          source.body.id === importId && source.body.normalizedText === null,
          'Source text is unavailable until asynchronous extraction completes',
        );
        const items = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/items`,
        );
        expectStatus(items, 200);
        assert(
          items.body.data.length === 0 && items.body.meta.total === 0,
          'A queued import must not create review items before worker processing',
        );
      },
    );

    await step(
      'Rejecting malformed, invalid-state, and non-admin import operations',
      async () => {
        expectStatus(
          await admin.request('POST', '/admin/ai/question-imports', {
            bankId: String(context.created.questionBanks.at(-1)),
            sourceId: String(context.created.questionSources.at(-1)),
            courseId,
            placements: [{ chapterId }],
            rawText: 'Valid raw text for this import.',
            sourceAssetId: 'asset-id-cannot-be-combined-with-text',
          }),
          400,
        );
        expectStatus(
          await admin.request(
            'PATCH',
            `/admin/ai/question-imports/${importId}/source-text`,
            {
              normalizedText:
                'This text cannot be edited while the import remains queued.',
            },
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/retry`,
          ),
          409,
        );
        expectStatus(
          await clients.partner.request('GET', '/admin/ai/question-imports'),
          403,
        );
        expectStatus(
          await clients.partner.request(
            'POST',
            '/admin/ai/question-imports',
            {},
          ),
          403,
        );
      },
    );
  },
};
