import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const batchId = process.argv[2];
const outputPath = resolve(process.argv[3] ?? `reports/ai-question-import/${batchId ?? 'latest'}-review.md`);

if (!batchId) throw new Error('Usage: tsx scripts/export-ai-import-review.ts <batch-id> [output-file]');

const prisma = new PrismaClient();
const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

async function main() {
  const batch = await prisma.questionImportBatch.findUnique({
    where: { id: batchId },
    include: {
      pages: { orderBy: { pageNumber: 'asc' } },
      items: { orderBy: [{ globalOrder: 'asc' }, { sequence: 'asc' }] },
      children: { orderBy: { childSequence: 'asc' }, include: { items: { orderBy: [{ globalOrder: 'asc' }, { sequence: 'asc' }] } } },
    },
  });
  if (!batch) throw new Error(`Question import batch ${batchId} was not found`);

  const items = [...batch.items, ...batch.children.flatMap((child) => child.items)];
  const lines: string[] = [
    '# AI question import review',
    '',
    `- Import: \`${batch.id}\``,
    `- Status: **${batch.status}**`,
    `- Source: \`${batch.sourceAssetId ?? 'raw text'}\``,
    `- Pages: ${batch.pages.length}`,
    `- Question candidates: ${items.length}`,
    '',
    '## Page transcriptions',
    '',
  ];

  for (const page of batch.pages) {
    lines.push(`## Page ${page.pageNumber} — ${page.status}`, '');
    if (page.confidence !== null) lines.push(`Confidence: ${page.confidence}`);
    if (page.verifiedAt) lines.push(`Independent verification: ${page.verifiedAt.toISOString()}`);
    const uncertain = list(page.uncertainSpans);
    const warnings = list(page.warnings);
    if (uncertain.length) lines.push('', 'Uncertain spans:', ...uncertain.map((value) => `- ${value}`));
    if (warnings.length) lines.push('', 'Warnings:', ...warnings.map((value) => `- ${value}`));
    if (page.errorDetail) lines.push('', `Review detail: ${page.errorDetail}`);
    if (page.initialAiText && page.verifiedAt) lines.push('', '<details>', '<summary>Initial OCR attempt</summary>', '', '```text', page.initialAiText, '```', '', '</details>');
    if (page.canonicalText) lines.push('', '```text', page.canonicalText, '```');
    else lines.push('', '_No transcription stored; this page was excluded from question extraction._');
    lines.push('');
  }

  lines.push('## Question candidates', '');
  if (!items.length) lines.push('_None yet. Segmentation is blocked until review-required transcription pages are resolved._', '');
  for (const item of items) {
    const output = item.normalizedOutput ?? item.rawOutput;
    lines.push(`### ${item.sourceNumber ?? `Candidate ${item.sequence}`} — ${item.status}`, '');
    if (item.sourceLocator) lines.push(`Source: \`${JSON.stringify(item.sourceLocator)}\``, '');
    lines.push('```json', JSON.stringify(output, null, 2), '```', '');
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(outputPath);
}

main().finally(() => prisma.$disconnect());
