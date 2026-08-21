import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

type Json = Record<string, unknown>;

const baseUrl = (process.env.AI_TEST_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const email = process.env.AI_TEST_ADMIN_EMAIL ?? process.env.SUPER_ADMIN_EMAIL;
const password = process.env.AI_TEST_ADMIN_PASSWORD ?? process.env.SUPER_ADMIN_PASSWORD;
const bankId = process.env.AI_TEST_BANK_ID;
const sourceId = process.env.AI_TEST_SOURCE_ID;
const courseId = process.env.AI_TEST_COURSE_ID;
const chapterId = process.env.AI_TEST_CHAPTER_ID;
const inputDirectory = resolve(process.env.AI_TEST_INPUT_DIR ?? 'example-questions');
const pollIntervalMs = Number(process.env.AI_TEST_POLL_INTERVAL_MS ?? 3000);
// PDF imports first transcribe every page and may then issue one real-AI
// extraction request per source chunk.  The former 15-minute default routinely
// expired for large visual fixtures while healthy work was still progressing.
const timeoutMs = Number(process.env.AI_TEST_TIMEOUT_MS ?? 3_600_000);
const requestedFile = process.env.AI_TEST_FILE;

if (!email || !password || !bankId || !sourceId || !courseId || !chapterId)
  throw new Error('AI_TEST_ADMIN_EMAIL, AI_TEST_ADMIN_PASSWORD, AI_TEST_BANK_ID, AI_TEST_SOURCE_ID, AI_TEST_COURSE_ID, and AI_TEST_CHAPTER_ID are required');

const supportedTextExtensions = new Set(['.md', '.txt', '.text']);
const supportedExtensions = new Set([...supportedTextExtensions, '.pdf']);
const terminalStatuses = new Set(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'AWAITING_REVIEW']);

function sleep(ms: number) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }
function now() { return new Date().toISOString(); }
function assertOk(response: Response, body: unknown) { if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`); }

async function main() {
  const runId = `real-ai-${now().replace(/[-:.TZ]/g, '')}`;
  const outputDirectory = resolve('reports', 'ai-question-import', runId);
  const rawLogPath = resolve(outputDirectory, 'ai-responses.jsonl');
  const summaryPath = resolve(outputDirectory, 'candidate-summary.json');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(rawLogPath, '');

  const logRaw = async (event: Json) => appendFile(rawLogPath, `${JSON.stringify({ observedAt: now(), ...event })}\n`);
  const request = async (method: string, path: string, token: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    assertOk(response, parsed);
    return parsed as any;
  };

  const login = await fetch(`${baseUrl}/api/v1/auth/admins/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  assertOk(login, loginBody);
  const token = loginBody.accessToken as string;
  const uploadPdfAsset = async (filePath: string, filename: string) => {
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename);
    const authorized = await fetch(`${baseUrl}/api/v1/admin/assets/upload?kind=PDF`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
    const authorizationBody = await authorized.json();
    assertOk(authorized, authorizationBody);
    const uploaded = await fetch(authorizationBody.upload.url, { method: authorizationBody.upload.method, headers: authorizationBody.upload.headers, body: bytes });
    if (!uploaded.ok) throw new Error(`Asset upload failed: ${uploaded.status} ${await uploaded.text()}`);
    return request('POST', `/admin/assets/${authorizationBody.asset.id}/complete`, token);
  };

  const entries = (await readdir(inputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && supportedExtensions.has(extname(entry.name).toLowerCase()) && (!requestedFile || entry.name === requestedFile))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) throw new Error(`No supported text files found in ${inputDirectory}`);

  const prisma = new PrismaClient();
  const summaries: Json[] = [];
  try {
    for (const entry of entries) {
      const filePath = resolve(inputDirectory, entry.name);
      const isPdf = extname(entry.name).toLowerCase() === '.pdf';
      const rawText = isPdf ? undefined : await readFile(filePath, 'utf8');
      const asset = isPdf ? await uploadPdfAsset(filePath, entry.name) : null;
      const created = await request('POST', '/admin/ai/question-imports', token, {
        bankId,
        sourceId,
        courseId,
        placements: [{ chapterId }],
        ...(asset ? { sourceAssetId: asset.id } : { rawText }),
      });
      const importId = created.id as string;
      await logRaw({ kind: 'import-created', file: entry.name, importId, response: created });

      const startedAt = Date.now();
      let detail: any;
      while (true) {
        detail = await request('GET', `/admin/ai/question-imports/${importId}`, token);
        await logRaw({ kind: 'batch-status', file: entry.name, importId, status: detail.status, detail });
        if (terminalStatuses.has(detail.status)) break;
        if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out waiting for ${entry.name} (${importId})`);
        await sleep(pollIntervalMs);
      }
      if (detail.status === 'FAILED')
        throw new Error(`Import ${entry.name} ended as ${detail.status}: ${detail.errorSummary ?? 'no error summary'}`);

      const itemsResponse = await request('GET', `/admin/ai/question-imports/${importId}/items?limit=100`, token);
      const sourceResponse = await request('GET', `/admin/ai/question-imports/${importId}/source-text`, token);
      const stored: any = await prisma.questionImportBatch.findUnique({
        where: { id: importId },
        include: {
          chunks: { orderBy: { sequence: 'asc' } },
          items: { orderBy: { createdAt: 'asc' } },
          sourceBlocks: { orderBy: { sequence: 'asc' } },
          pages: { orderBy: { pageNumber: 'asc' } },
          children: { orderBy: { childSequence: 'asc' }, include: { chunks: { orderBy: { sequence: 'asc' } }, items: { orderBy: { createdAt: 'asc' } }, sourceBlocks: { orderBy: { sequence: 'asc' } } } },
        },
      });
      if (!stored) throw new Error(`Import ${importId} was not found in the database`);

      for (const child of stored.children.length ? stored.children : [stored]) {
        await logRaw({ kind: 'segmentation-provider-response', file: entry.name, importId, childImportId: child.id, pageScope: child.pageScope, rawResponse: child.segmentationRawOutput, usage: child.segmentationUsage, warnings: child.segmentationWarnings });
        for (const chunk of child.chunks) {
          let input: unknown = chunk.text;
          try { input = JSON.parse(chunk.text); } catch { /* Keep the original text if the stored chunk is not JSON. */ }
          await logRaw({ kind: 'extraction-provider-response', file: entry.name, importId, childImportId: child.id, chunkId: chunk.id, sequence: chunk.sequence, input, rawResponse: chunk.rawResponse, usage: chunk.usage, errorDetail: chunk.errorDetail });
        }
        for (const item of child.items)
          await logRaw({ kind: 'candidate-response', file: entry.name, importId, childImportId: child.id, itemId: item.id, sequence: item.sequence, status: item.status, rawOutput: item.rawOutput, normalizedOutput: item.normalizedOutput, confidence: item.confidence, warnings: item.warnings, errorDetail: item.errorDetail });
      }
      for (const page of stored.pages)
        await logRaw({ kind: 'transcription-provider-response', file: entry.name, importId, pageNumber: page.pageNumber, status: page.status, confidence: page.confidence, warnings: page.warnings, uncertainSpans: page.uncertainSpans, providerFileId: page.providerFileId, rawResponse: page.rawProviderResponse, usage: page.usage, errorDetail: page.errorDetail });
      await logRaw({ kind: 'retained-source', file: entry.name, importId, source: sourceResponse });

      summaries.push({
        file: entry.name,
        importId,
        status: detail.status,
        model: detail.model,
        counts: { totalItems: detail.totalItems, createdQuestions: detail.createdQuestions, invalidItems: detail.invalidItems, failedItems: detail.failedItems },
        sourceBlockCount: (stored.children.length ? stored.children : [stored]).reduce((count, child) => count + child.sourceBlocks.length, 0),
        chunkCount: (stored.children.length ? stored.children : [stored]).reduce((count, child) => count + child.chunks.length, 0),
        childImports: stored.children.map((child) => ({ id: child.id, status: child.status, pageScope: child.pageScope, counts: { totalItems: child.totalItems, createdQuestions: child.createdQuestions, invalidItems: child.invalidItems, failedItems: child.failedItems } })),
        transcriptionPages: stored.pages.map((page) => ({ pageNumber: page.pageNumber, status: page.status, confidence: page.confidence, warnings: page.warnings, uncertainSpans: page.uncertainSpans })),
        candidates: itemsResponse.data.map((item: any) => ({ id: item.id, sequence: item.sequence, status: item.status, questionId: item.questionId, sourceNumber: item.sourceNumber, globalOrder: item.globalOrder, section: item.section, detectedType: item.detectedType, confidence: item.confidence, answerOrigin: item.answerOrigin, warnings: item.warnings, errorDetail: item.errorDetail })),
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  await writeFile(summaryPath, `${JSON.stringify({ runId, inputDirectory, files: summaries, rawResponsesFile: rawLogPath }, null, 2)}\n`);
  console.log(JSON.stringify({ runId, filesProcessed: entries.map((entry) => entry.name), summaryPath, rawResponsesFile: rawLogPath, summaries }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
