import { readFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { assert, expectStatus } from '../lib/assertions.js';
import type { JourneyDefinition } from '../lib/types.js';

const terminalStatuses = new Set([
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'AWAITING_REVIEW',
]);

function sleep(milliseconds: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function questionImportFixture() {
  // model1.md is a real Arabic question set committed with the repository.
  // A staging drill can select either PDF without editing this journey:
  // JOURNEY_AI_IMPORT_FILE=10-exams.pdf (or book-images.pdf).
  const filename = process.env.JOURNEY_AI_IMPORT_FILE?.trim() || 'model1.md';
  const fixtureDirectory = resolve('example-questions');
  const path = resolve(fixtureDirectory, filename);
  const fixtureRelativePath = relative(fixtureDirectory, path);
  assert(
    fixtureRelativePath &&
      !fixtureRelativePath.startsWith('..') &&
      !fixtureRelativePath.startsWith('/'),
    'JOURNEY_AI_IMPORT_FILE must name a file inside example-questions',
  );
  const extension = extname(filename).toLowerCase();
  assert(
    extension === '.md' || extension === '.txt' || extension === '.pdf',
    'JOURNEY_AI_IMPORT_FILE must be a .md, .txt, or .pdf fixture',
  );
  return { filename, path, isPdf: extension === '.pdf' };
}

/** CONTENT-019 — Admin AI-question-import queue, worker, and review contract. */
export const aiQuestionImportJourney: JourneyDefinition = {
  id: 'CONTENT-019',
  name: 'AI question import queue, worker, and review contract',
  category: 'content',
  dependsOn: ['CONTENT-006'],
  // PDF fixtures use direct Bunny upload. Keeping live-AI work off local runs
  // also prevents accidental provider charges.
  requiresBunny: true,
  async run({ clients, context, step }) {
    const admin = clients.admin;
    const courseId = String(context.academic.courseId);
    const chapterId = String(context.academic.chapterId);
    const fixture = questionImportFixture();
    const fixtureBytes = await readFile(fixture.path);
    const fixtureText = fixture.isPdf ? undefined : fixtureBytes.toString('utf8');
    const timeoutMs = Number(
      process.env.JOURNEY_AI_IMPORT_TIMEOUT_MS ?? '1800000',
    );
    const pollIntervalMs = Number(
      process.env.JOURNEY_AI_IMPORT_POLL_INTERVAL_MS ?? '5000',
    );
    assert(
      Number.isInteger(timeoutMs) && timeoutMs >= 60_000 && timeoutMs <= 3_600_000,
      'JOURNEY_AI_IMPORT_TIMEOUT_MS must be an integer between 60000 and 3600000',
    );
    assert(
      Number.isInteger(pollIntervalMs) &&
        pollIntervalMs >= 1000 &&
        pollIntervalMs <= 30_000,
      'JOURNEY_AI_IMPORT_POLL_INTERVAL_MS must be an integer between 1000 and 30000',
    );
    assert(
      fixtureBytes.length > 0 && (!fixtureText || fixtureText.trim().length > 0),
      `AI import fixture ${fixture.filename} must not be empty`,
    );

    let importId = '';
    let finalDetail: any;

    await step(
      `Queueing the real ${fixture.filename} question-import fixture`,
      async () => {
        const sourceAssetId = fixture.isPdf
          ? (
              await admin.upload<any>(
                '/admin/assets/upload?kind=PDF',
                {
                  buffer: fixtureBytes,
                  filename: `ai-import-${context.runId}-${fixture.filename}`,
                  contentType: 'application/pdf',
                },
              )
            ).body.id
          : undefined;
        const created = await admin.request<any>(
          'POST',
          '/admin/ai/question-imports',
          {
            bankId: String(context.created.questionBanks.at(-1)),
            sourceId: String(context.created.questionSources.at(-1)),
            courseId,
            placements: [{ chapterId }],
            ...(sourceAssetId ? { sourceAssetId } : { rawText: fixtureText }),
          },
        );
        expectStatus(created, 201);
        importId = created.body.id;
        context.created.questionImports.push(importId);
        assert(
          created.body.inputType === (fixture.isPdf ? 'PDF' : 'RAW_TEXT') &&
            created.body.status === 'QUEUED' &&
            created.body.bankId === context.created.questionBanks.at(-1) &&
            !('rawText' in created.body) &&
            !('normalizedText' in created.body),
          'A queued import summary must retain its target but never expose source text',
        );
      },
    );

    await step(
      'Waiting for the configured AI worker to process the real fixture',
      async () => {
        const startedAt = Date.now();
        while (true) {
          const detail = await admin.request<any>(
            'GET',
            `/admin/ai/question-imports/${importId}`,
          );
          expectStatus(detail, 200);
          if (terminalStatuses.has(detail.body.status)) {
            finalDetail = detail.body;
            break;
          }
          assert(
            Date.now() - startedAt < timeoutMs,
            `Timed out waiting for AI import ${importId} after ${timeoutMs}ms`,
          );
          await sleep(pollIntervalMs);
        }
        assert(
          finalDetail.status !== 'FAILED',
          `AI import ${fixture.filename} failed: ${finalDetail.errorSummary ?? 'no error summary'}`,
        );
      },
    );

    await step(
      'Reading retained source, generated candidates, and visual-media state',
      async () => {
        const listed = await admin.request<any>(
          'GET',
          '/admin/ai/question-imports?page=1&limit=100',
        );
        expectStatus(listed, 200);
        assert(
          listed.body.data.some((item: any) => item.id === importId) &&
            typeof listed.body.meta?.total === 'number',
          'The real import must be discoverable in the paginated queue',
        );
        const source = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/source-text`,
        );
        expectStatus(source, 200);
        assert(
          source.body.id === importId &&
            ((typeof source.body.normalizedText === 'string' &&
              source.body.normalizedText.trim().length > 0) ||
              (fixture.isPdf &&
                Array.isArray(source.body.pages) &&
                source.body.pages.some(
                  (page: any) =>
                    typeof page.canonicalText === 'string' &&
                    page.canonicalText.trim().length > 0,
                ))),
          'The worker must retain normalized source text for the real fixture',
        );
        const items = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/items?limit=100`,
        );
        expectStatus(items, 200);
        assert(
          Array.isArray(items.body.data) &&
            items.body.data.length > 0 &&
            typeof items.body.meta?.total === 'number',
          'The real question fixture must yield one or more review candidates',
        );
        const media = await admin.request<any>(
          'GET',
          `/admin/ai/question-imports/${importId}/media`,
        );
        expectStatus(media, fixture.isPdf ? 200 : 409);
      },
    );

    await step('Rejecting malformed and non-admin import operations', async () => {
      expectStatus(
        await admin.request('POST', '/admin/ai/question-imports', {
          bankId: String(context.created.questionBanks.at(-1)),
          sourceId: String(context.created.questionSources.at(-1)),
          courseId,
          placements: [{ chapterId }],
          rawText: 'This must not be combined with an asset.',
          sourceAssetId: 'asset-id-cannot-be-combined-with-text',
        }),
        400,
      );
      // The default real fixture is raw text. These PDF-only and retry routes
      // must reject it without changing the completed import; they also retain
      // coverage of every review-operation contract.
      if (!fixture.isPdf) {
        expectStatus(
          await admin.request('PATCH', `/admin/ai/question-imports/${importId}/source-text`, {
            normalizedText: 'This completed real import must not be edited through the retry path.',
          }),
          409,
        );
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/chunks/missing-chunk/retry`), 404);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/pages/1/retry`), 409);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/children/missing-child/retry`), 404);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/items/missing-item/retry`), 409);
        expectStatus(await admin.request('GET', `/admin/ai/question-imports/${importId}/media`), 409);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/media`, {
          pageNumber: 1, type: 'DIAGRAM', bounds: { left: 0, top: 0, right: 100, bottom: 100 }, description: 'Not available for raw-text imports',
        }), 409);
        expectStatus(await admin.request('PATCH', `/admin/ai/question-imports/${importId}/media/MISSING`, { description: 'Not available for raw-text imports' }), 409);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/media/MISSING/retry`), 409);
        expectStatus(await admin.request('PATCH', `/admin/ai/question-imports/${importId}/items/missing-item/media`, { assignments: [] }), 409);
        expectStatus(await admin.request('POST', `/admin/ai/question-imports/${importId}/items/missing-item/reject`, { reason: 'Not a review candidate' }), 409);
        // Keep this state-changing call last: a completed import with
        // invalid/reviewable candidates may be retried (201), while an import
        // with no retryable work is rejected (409). Both outcomes are valid.
        expectStatus(
          await admin.request('POST', `/admin/ai/question-imports/${importId}/retry`),
          [201, 409],
        );
      }
      expectStatus(
        await clients.partner.request('GET', '/admin/ai/question-imports'),
        403,
      );
      expectStatus(
        await clients.partner.request('POST', '/admin/ai/question-imports', {}),
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
    });
  },
};
