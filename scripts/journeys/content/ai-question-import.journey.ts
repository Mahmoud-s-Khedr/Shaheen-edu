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
      'Reading the asynchronous import, retained source endpoint, and candidate list',
      async () => {
        // A live worker may claim a newly-created import before this next HTTP
        // request, so it is not safe to expect it to remain QUEUED here.
        // Check the status filter's response contract independently, then find
        // this durable import in the unfiltered newest-page listing.
        const queued = await admin.request<any>(
          'GET',
          '/admin/ai/question-imports?status=QUEUED',
        );
        expectStatus(queued, 200);
        assert(
          Array.isArray(queued.body.data) &&
            queued.body.data.every((item: any) => item.status === 'QUEUED') &&
            typeof queued.body.meta?.total === 'number',
          'Queued-import filtering must return a paginated, status-consistent response',
        );
        const listed = await admin.request<any>(
          'GET',
          '/admin/ai/question-imports?page=1&limit=100',
        );
        expectStatus(listed, 200);
        assert(
          listed.body.data.some((item: any) => item.id === importId) &&
            typeof listed.body.meta?.total === 'number',
          'A newly created import must be discoverable in the paginated queue',
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
          source.body.id === importId &&
            (source.body.normalizedText === null ||
              typeof source.body.normalizedText === 'string'),
          'Source endpoint must expose the import source state while processing',
        );
        const items = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/items`,
        );
        expectStatus(items, 200);
        assert(
          Array.isArray(items.body.data) &&
            typeof items.body.meta?.total === 'number',
          'Candidate-list endpoint must remain paginated while processing',
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
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/items/missing-item/retry`,
          ),
          409,
        );
        // These media/page/chunk endpoints are intentionally exercised against
        // the raw-text fixture: they must reject non-PDF imports without
        // touching storage or queue state. This still covers the documented
        // route contracts while the full visual-import fixture remains
        // deployment-dependent.
        expectStatus(
          await admin.request(
            'GET',
            `/admin/ai/question-imports/${importId}/media`,
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/media`,
            {
              pageNumber: 1,
              type: 'DIAGRAM',
              bounds: { left: 0, top: 0, right: 100, bottom: 100 },
              description: 'Invalid raw-text media fixture',
            },
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'PATCH',
            `/admin/ai/question-imports/${importId}/media/MISSING`,
            { description: 'Invalid raw-text media fixture' },
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/media/MISSING/retry`,
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'PATCH',
            `/admin/ai/question-imports/${importId}/items/missing-item/media`,
            { assignments: [] },
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/children/missing-child/retry`,
          ),
          404,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/chunks/missing-chunk/retry`,
          ),
          404,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/pages/1/retry`,
          ),
          409,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/items/missing-item/accept`,
            { candidate: {} },
          ),
          404,
        );
        expectStatus(
          await admin.request(
            'POST',
            `/admin/ai/question-imports/${importId}/items/missing-item/reject`,
            { reason: 'Not a review candidate' },
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
        expectStatus(
          await clients.partner.request(
            'POST',
            `/admin/ai/question-imports/${importId}/items/missing-item/accept`,
            { candidate: {} },
          ),
          403,
        );
      },
    );
  },
};
