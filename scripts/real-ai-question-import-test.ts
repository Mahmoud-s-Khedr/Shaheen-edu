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
const timeoutMs = Number(process.env.AI_TEST_TIMEOUT_MS ?? 900000);

if (!email || !password || !bankId || !sourceId || !courseId || !chapterId)
  throw new Error('AI_TEST_ADMIN_EMAIL, AI_TEST_ADMIN_PASSWORD, AI_TEST_BANK_ID, AI_TEST_SOURCE_ID, AI_TEST_COURSE_ID, and AI_TEST_CHAPTER_ID are required');

const supportedTextExtensions = new Set(['.md', '.txt', '.text']);
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

  const entries = (await readdir(inputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && supportedTextExtensions.has(extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) throw new Error(`No supported text files found in ${inputDirectory}`);

  const prisma = new PrismaClient();
  const summaries: Json[] = [];
  try {
    for (const entry of entries) {
      const filePath = resolve(inputDirectory, entry.name);
      const rawText = await readFile(filePath, 'utf8');
      const created = await request('POST', '/admin/ai/question-imports', token, {
        bankId,
        sourceId,
        courseId,
        placements: [{ chapterId }],
        rawText,
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

      const itemsResponse = await request('GET', `/admin/ai/question-imports/${importId}/items?limit=100`, token);
      const sourceResponse = await request('GET', `/admin/ai/question-imports/${importId}/source-text`, token);
      const stored: any = await prisma.questionImportBatch.findUnique({
        where: { id: importId },
        include: {
          chunks: { orderBy: { sequence: 'asc' } },
          items: { orderBy: { createdAt: 'asc' } },
          sourceBlocks: { orderBy: { sequence: 'asc' } },
        },
      });
      if (!stored) throw new Error(`Import ${importId} was not found in the database`);

      await logRaw({
        kind: 'segmentation-provider-response',
        file: entry.name,
        importId,
        rawResponse: stored.segmentationRawOutput,
        usage: stored.segmentationUsage,
        warnings: stored.segmentationWarnings,
      });
      for (const chunk of stored.chunks) {
        let input: unknown = chunk.text;
        try { input = JSON.parse(chunk.text); } catch { /* Keep the original text if the stored chunk is not JSON. */ }
        await logRaw({ kind: 'extraction-provider-response', file: entry.name, importId, chunkId: chunk.id, sequence: chunk.sequence, input, rawResponse: chunk.rawResponse, usage: chunk.usage, errorDetail: chunk.errorDetail });
      }
      for (const item of stored.items)
        await logRaw({ kind: 'candidate-response', file: entry.name, importId, itemId: item.id, sequence: item.sequence, status: item.status, rawOutput: item.rawOutput, normalizedOutput: item.normalizedOutput, confidence: item.confidence, warnings: item.warnings, errorDetail: item.errorDetail });
      await logRaw({ kind: 'retained-source', file: entry.name, importId, source: sourceResponse });

      summaries.push({
        file: entry.name,
        importId,
        status: detail.status,
        model: detail.model,
        counts: { totalItems: detail.totalItems, createdQuestions: detail.createdQuestions, invalidItems: detail.invalidItems, failedItems: detail.failedItems },
        sourceBlockCount: stored.sourceBlocks.length,
        chunkCount: stored.chunks.length,
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
