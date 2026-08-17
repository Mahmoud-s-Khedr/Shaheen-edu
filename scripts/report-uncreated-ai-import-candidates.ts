import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const importId = process.argv[2];
if (!importId) throw new Error('Usage: tsx scripts/report-uncreated-ai-import-candidates.ts <parent-import-id>');

const prisma = new PrismaClient();

function json(value: unknown) {
  return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function questionText(item: any) {
  const output = item.normalizedOutput ?? item.rawOutput;
  if (!output || typeof output !== 'object') return '(No structured question output retained)';
  const candidate = output as { body?: string; options?: Array<{ body?: string; isCorrect?: boolean }> };
  const options = candidate.options?.map((option, index) => `${index + 1}. ${option.body ?? ''}${option.isCorrect ? ' [correct]' : ''}`).join('\n') ?? '';
  return `${candidate.body ?? '(No question body)'}${options ? `\n${options}` : ''}`;
}

async function main() {
  const parent = await prisma.questionImportBatch.findUnique({
    where: { id: importId },
    include: {
      children: {
        orderBy: { childSequence: 'asc' },
        include: {
          items: { where: { status: { in: ['REVIEW_REQUIRED', 'INVALID'] } }, orderBy: [{ globalOrder: 'asc' }, { sequence: 'asc' }] },
          chunks: { where: { status: 'FAILED' }, orderBy: { sequence: 'asc' } },
        },
      },
    },
  });
  if (!parent) throw new Error(`Import ${importId} was not found`);

  const candidates = parent.children.flatMap((child) => child.items.map((item) => ({
    childSequence: child.childSequence,
    item: {
      id: item.id, sequence: item.sequence, status: item.status, sourceNumber: item.sourceNumber,
      globalOrder: item.globalOrder, section: item.section, detectedType: item.detectedType,
      confidence: item.confidence, answerOrigin: item.answerOrigin, warnings: json(item.warnings),
      sourceLocator: json(item.sourceLocator), errorDetail: item.errorDetail,
      normalizedOutput: json(item.normalizedOutput), rawOutput: json(item.rawOutput),
    },
  })));
  const failedChunks = parent.children.flatMap((child) => child.chunks.map((chunk) => ({
    childSequence: child.childSequence, sequence: chunk.sequence, id: chunk.id, errorDetail: chunk.errorDetail,
    sourceLocator: json(chunk.sourceLocator), input: (() => { try { return JSON.parse(chunk.text); } catch { return chunk.text; } })(),
  })));
  const summary = {
    generatedAt: new Date().toISOString(), importId: parent.id, importStatus: parent.status,
    candidatesNotCreated: candidates.length,
    byStatus: Object.fromEntries(['REVIEW_REQUIRED', 'INVALID'].map((status) => [status, candidates.filter(({ item }) => item.status === status).length])),
    failedExtractionChunks: failedChunks.length,
  };
  const outputDirectory = resolve('reports', 'ai-question-import', `uncreated-${importId}`);
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = resolve(outputDirectory, 'uncreated-candidates.json');
  const markdownPath = resolve(outputDirectory, 'uncreated-candidates.md');
  await writeFile(jsonPath, `${JSON.stringify({ summary, candidates, failedChunks }, null, 2)}\n`);
  const markdown = [
    '# AI import candidates not created as drafts', '',
    `- Import: \`${parent.id}\``, `- Snapshot status: \`${parent.status}\``,
    `- Not created: ${candidates.length} (${summary.byStatus.REVIEW_REQUIRED} review-required, ${summary.byStatus.INVALID} invalid)`,
    `- Failed extraction chunks: ${failedChunks.length}`, '',
    '## Candidates', '',
    ...candidates.flatMap(({ childSequence, item }, index) => [
      `### ${index + 1}. ${item.status} — range ${childSequence}, source ${item.sourceNumber ?? 'unknown'}`,
      '', questionText(item), '',
      `- Confidence: ${item.confidence ?? 'n/a'}`,
      `- Warnings: ${Array.isArray(item.warnings) && item.warnings.length ? item.warnings.join('; ') : 'none'}`,
      `- Locator: \`${JSON.stringify(item.sourceLocator ?? {})}\``, '',
    ]),
    '## Failed extraction chunks', '',
    ...failedChunks.flatMap((chunk) => [
      `### Range ${chunk.childSequence}, chunk ${chunk.sequence}`,
      '', `- Error: ${chunk.errorDetail ?? 'unknown'}`,
      `- Source locator: \`${JSON.stringify(chunk.sourceLocator ?? {})}\``,
      `- Input: \`${JSON.stringify(chunk.input)}\``, '',
    ]),
  ].join('\n');
  await writeFile(markdownPath, markdown);
  console.log(JSON.stringify({ ...summary, jsonPath, markdownPath }, null, 2));
}

main().finally(() => prisma.$disconnect());
