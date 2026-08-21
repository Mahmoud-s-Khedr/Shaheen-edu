import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const baseUrl = (process.env.AI_EXPORT_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const importId = process.env.AI_EXPORT_IMPORT_ID ?? 'cmt0gk3h80007n301ff6o0ufs';
const email = process.env.AI_EXPORT_ADMIN_EMAIL ?? process.env.AI_TEST_ADMIN_EMAIL ?? 'superadmin@example.com';
const password = process.env.AI_EXPORT_ADMIN_PASSWORD ?? process.env.AI_TEST_ADMIN_PASSWORD ?? 'ChangeThisPassword123!';
const outputDirectory = resolve(process.env.AI_EXPORT_OUTPUT_DIR ?? `reports/ai-question-import/book-images-${importId}`);
const reportTitle = process.env.AI_EXPORT_TITLE ?? 'AI Question Import';

type AnyRecord = Record<string, any>;

function json(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {};
}

function md(value: unknown): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function inline(value: unknown): string {
  return md(value).replace(/\n+/g, ' ').replace(/\|/g, '\\|');
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(md).filter(Boolean) : [];
}

function candidateOf(item: AnyRecord): AnyRecord {
  return json(item.normalizedOutput ?? item.rawOutput);
}

function optionRows(candidate: AnyRecord): AnyRecord[] {
  const options = Array.isArray(candidate.options) ? candidate.options : [];
  const selected = new Set(Array.isArray(candidate.selectedOptionIndexes) ? candidate.selectedOptionIndexes : []);
  return options.map((option, index) => ({
    body: md(option?.body),
    isCorrect: option?.isCorrect === true || selected.has(index),
    index,
  }));
}

function sourceMaterial(
  item: AnyRecord,
  chunksById: Map<string, AnyRecord>,
): { question: AnyRecord; contexts: AnyRecord[] } {
  const chunk = chunksById.get(String(item.chunkId));
  if (!chunk || typeof chunk.text !== 'string') return { question: {}, contexts: [] };
  try {
    const payload = json(JSON.parse(chunk.text));
    const questions = Array.isArray(payload.questions) ? payload.questions : [];
    const question = json(questions[Number(item.sequence) - 1]);
    const contextIds = new Set(list(question.contextIds));
    const contexts = (Array.isArray(payload.contexts) ? payload.contexts : [])
      .map(json)
      .filter((context) => contextIds.has(md(context.id)));
    return { question, contexts };
  } catch {
    return { question: {}, contexts: [] };
  }
}

function assignmentImage(assignment: AnyRecord): string {
  return `images/${assignment.mediaKey}.png`;
}

async function request(path: string, token: string): Promise<any> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  await mkdir(join(outputDirectory, 'images'), { recursive: true });
  const login = await fetch(`${baseUrl}/api/v1/auth/admins/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await login.json();
  if (!login.ok) throw new Error(`Admin login failed: ${login.status} ${JSON.stringify(loginBody)}`);
  const token = loginBody.accessToken as string;

  const detail = await request(`/admin/ai/question-imports/${importId}`, token);
  const mediaResponse = await request(`/admin/ai/question-imports/${importId}/media`, token);
  const media = Array.isArray(mediaResponse.data) ? mediaResponse.data : [];
  const items: AnyRecord[] = [];
  let page = 1;
  while (true) {
    const response = await request(`/admin/ai/question-imports/${importId}/items?page=${page}&limit=100`, token);
    items.push(...(Array.isArray(response.data) ? response.data : []));
    if (!response.meta || page >= response.meta.totalPages) break;
    page += 1;
  }
  const prisma = new PrismaClient();
  const stored: any = await prisma.questionImportBatch.findUnique({
    where: { id: importId },
    include: {
      chunks: true,
      children: { include: { chunks: true } },
    },
  });
  await prisma.$disconnect();
  if (!stored) throw new Error(`Import ${importId} was not found in the database`);
  const chunksById = new Map<string, AnyRecord>();
  for (const batch of stored.children.length ? stored.children : [stored])
    for (const chunk of batch.chunks)
      chunksById.set(chunk.id, chunk as AnyRecord);

  const downloadFailures: string[] = [];
  let cursor = 0;
  const concurrency = 8;
  async function downloadNext(): Promise<void> {
    const index = cursor++;
    if (index >= media.length) return;
    const visual = media[index];
    const target = join(outputDirectory, 'images', `${visual.mediaKey}.png`);
    try {
      if (!visual.preview?.url) throw new Error('preview URL missing');
      const response = await fetch(visual.preview.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
    } catch (error: any) {
      downloadFailures.push(`${visual.mediaKey}: ${error.message}`);
    }
    await downloadNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, media.length) }, () => downloadNext()));

  const sourceMaterials = new Map<string, ReturnType<typeof sourceMaterial>>();
  for (const item of items) {
    const material = sourceMaterial(item, chunksById);
    sourceMaterials.set(item.id, material);
  }
  const counts = items.reduce<Record<string, number>>((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {});
  const lines: string[] = [];
  lines.push(`# ${reportTitle}`);
  lines.push('');
  lines.push(`Customer review package generated from import \`${importId}\`.`);
  lines.push('');
  lines.push('## Import summary');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---:|');
  lines.push(`| Schema | ${inline(detail.schemaVersion)} |`);
  lines.push(`| Batch status | ${inline(detail.status)} |`);
  lines.push(`| PDF pages | ${detail.pages?.length ?? '—'} |`);
  lines.push(`| Visuals extracted | ${media.length} |`);
  lines.push(`| Question candidates | ${items.length} |`);
  lines.push(`| Draft questions created | ${detail.createdQuestions ?? counts.CREATED ?? 0} |`);
  lines.push(`| Review required | ${counts.REVIEW_REQUIRED ?? 0} |`);
  lines.push(`| Invalid / excluded from automatic creation | ${counts.INVALID ?? 0} |`);
  lines.push(`| Failed chunks | ${detail.failedItems ?? 0} |`);
  lines.push('');
  lines.push('`REVIEW_REQUIRED` candidates are intentionally not published; they need an admin to verify the answer and visual ownership. `INVALID` candidates were retained for correction but failed a required structural, citation, or visual-safety rule.');
  lines.push('');
  lines.push('## Questions and answers');
  lines.push('');

  for (const [index, item] of items.entries()) {
    const candidate = candidateOf(item);
    const options = optionRows(candidate);
    const assignments = Array.isArray(item.mediaAssignments) ? item.mediaAssignments : [];
    const contextAssignments = assignments.filter((assignment) => assignment.owner === 'CONTEXT');
    const questionAssignments = assignments.filter((assignment) => assignment.owner !== 'CONTEXT');
    const sourceMaterialForItem = sourceMaterials.get(item.id) ?? { question: {}, contexts: [] };
    const source = json(item.sourceLocator);
    const citedBlocks = list(candidate.citedSourceBlockKeys ?? item.citedSourceBlockKeys);
    const citedEvidence = list(candidate.citedEvidenceKeys ?? item.citedEvidenceKeys);
    lines.push(`### ${index + 1}. Review candidate`);
    lines.push('');
    lines.push(`**Status:** \`${item.status}\`  `);
    lines.push(`**Type:** ${inline(candidate.type || item.detectedType || '—')}  `);
    lines.push(`**Confidence:** ${candidate.confidence ?? item.confidence ?? '—'}  `);
    lines.push(`**Source:** page ${source.page ?? '—'}, ${source.firstBlock ?? '—'}–${source.lastBlock ?? '—'}  `);
    lines.push(`**Answer provenance:** ${inline(item.answerOrigin ?? candidate.answerOrigin ?? '—')}`);
    lines.push('');

    if (sourceMaterialForItem.contexts.length || contextAssignments.length) {
      lines.push('**Shared context**');
      lines.push('');
      for (const context of sourceMaterialForItem.contexts) {
        lines.push(`_${inline(context.title || context.type || 'Untitled context')}_`);
        lines.push('');
        lines.push(md(context.text) || '_No context text retained._');
        lines.push('');
      }
      for (const assignment of contextAssignments) {
        lines.push(`![${assignment.mediaKey}](${assignmentImage(assignment)})`);
        lines.push('');
        lines.push(`_Context image ${assignment.mediaKey}: ${inline(assignment.status)}, confidence ${assignment.confidence ?? '—'}${assignment.reason ? ` — ${inline(assignment.reason)}` : ''}_`);
        lines.push('');
      }
    }

    lines.push('**Question**');
    lines.push('');
    lines.push(md(candidate.body) || '_No question text retained._');
    lines.push('');

    if (questionAssignments.length) {
      lines.push('**Images and visual ownership**');
      lines.push('');
      for (const assignment of questionAssignments) {
        const label = `${assignment.owner} (${assignment.ownerReference})`;
        lines.push(`- ![${assignment.mediaKey}](${assignmentImage(assignment)}) — **${label}**, ${inline(assignment.status)}, confidence ${assignment.confidence ?? '—'}${assignment.reason ? `: ${inline(assignment.reason)}` : ''}`);
      }
      lines.push('');
    }

    if (sourceMaterialForItem.question.text) {
      lines.push('**Source transcription**');
      lines.push('');
      lines.push(md(sourceMaterialForItem.question.text));
      lines.push('');
    }

    if (options.length) {
      lines.push('**Options**');
      lines.push('');
      for (const option of options) lines.push(`${option.index + 1}. ${option.body || '_Visual option — see linked image above._'}${option.isCorrect ? ' ✅' : ''}`);
      lines.push('');
      const correct = options.filter((option) => option.isCorrect).map((option) => option.index + 1);
      lines.push(`**Answer:** ${correct.length ? `option${correct.length > 1 ? 's' : ''} ${correct.join(', ')}` : '_Not marked / requires review_'}`);
      lines.push('');
    } else if (list(candidate.acceptedAnswers).length) {
      lines.push(`**Accepted answer(s):** ${list(candidate.acceptedAnswers).map(inline).join('; ')}`);
      lines.push('');
    } else if (candidate.gradingRubric) {
      lines.push('**Grading rubric**');
      lines.push('');
      lines.push(md(candidate.gradingRubric));
      lines.push('');
    } else {
      lines.push('**Answer:** _Not available; requires review._');
      lines.push('');
    }

    if (candidate.explanation) {
      lines.push('**Explanation**');
      lines.push('');
      lines.push(md(candidate.explanation));
      lines.push('');
    }
    const warnings = list(candidate.warnings ?? item.warnings);
    if (warnings.length) {
      lines.push('**Warnings**');
      lines.push('');
      for (const warning of warnings) lines.push(`- ${warning}`);
      lines.push('');
    }
    if (item.errorDetail) {
      lines.push(`**Import note:** ${inline(item.errorDetail)}`);
      lines.push('');
    }
    if (citedBlocks.length || citedEvidence.length) {
      lines.push(`**Citations:** ${citedBlocks.length ? `source blocks ${citedBlocks.join(', ')}` : ''}${citedEvidence.length ? `${citedBlocks.length ? '; ' : ''}answer evidence ${citedEvidence.join(', ')}` : ''}`);
      lines.push('');
    }
    lines.push('---');
    lines.push('');
  }

  lines.push('## Visual library');
  lines.push('');
  lines.push('Every extracted crop is included under `images/` and can be opened independently.');
  lines.push('');
  lines.push('| Media key | Page | Type | Status | Preview |');
  lines.push('|---|---:|---|---|---|');
  for (const visual of media) lines.push(`| ${visual.mediaKey} | ${visual.pageNumber} | ${visual.type} | ${visual.status} | [open](images/${visual.mediaKey}.png) |`);
  lines.push('');
  if (downloadFailures.length) {
    lines.push('### Image download failures');
    lines.push('');
    for (const failure of downloadFailures) lines.push(`- ${failure}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('Generated by the AI question import review export.');
  await writeFile(join(outputDirectory, 'questions-and-answers.md'), `${lines.join('\n')}\n`, 'utf8');
  await writeFile(join(outputDirectory, 'export-summary.json'), JSON.stringify({ importId, outputDirectory, itemCount: items.length, mediaCount: media.length, counts, downloadFailures }, null, 2));
  console.log(JSON.stringify({ outputDirectory, markdown: join(outputDirectory, 'questions-and-answers.md'), itemCount: items.length, mediaCount: media.length, counts, downloadFailures }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
