/* eslint-disable no-console */
import { AssessmentAttributionRole, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const batchSize = 250;

export function buildAttributionRows(rows: Array<{ id: string; sourceQuestionId: string }>, sourceByQuestion: Map<string, any>) {
  let resolvable = 0; let unknown = 0;
  const data = rows.map((row) => {
    const source = sourceByQuestion.get(row.sourceQuestionId); if (source) resolvable += 1; else unknown += 1;
    return { assessmentQuestionId: row.id, sourceId: source?.id ?? null, sourceTitle: source?.titleAr ?? null, sourceType: source?.type ?? null, publisherUserId: source?.publisherUserId ?? null, publisherDisplayName: source?.publisher?.displayName ?? null, role: source ? AssessmentAttributionRole.PRIMARY : AssessmentAttributionRole.UNKNOWN_LEGACY, weightBps: 10_000 };
  });
  return { data, resolvable, unknown };
}

async function main() {
  let cursor: string | undefined; let scanned = 0; let resolvable = 0; let unknown = 0;
  do {
    const rows = await prisma.assessmentQuestion.findMany({
      where: { attributions: { none: {} } }, orderBy: { id: 'asc' }, take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, sourceQuestionId: true },
    });
    if (!rows.length) break; cursor = rows.at(-1)!.id; scanned += rows.length;
    const sources = await prisma.question.findMany({ where: { id: { in: rows.map((row) => row.sourceQuestionId) } }, select: { id: true, source: { select: { id: true, titleAr: true, type: true, publisherUserId: true, publisher: { select: { displayName: true } } } } } });
    const sourceByQuestion = new Map(sources.map((question) => [question.id, question.source]));
    const result = buildAttributionRows(rows, sourceByQuestion); resolvable += result.resolvable; unknown += result.unknown;
    if (apply) await prisma.assessmentQuestionAttribution.createMany({ data: result.data, skipDuplicates: true });
  } while (cursor);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'report', scanned, resolvable, unknown, message: apply ? 'Created attribution snapshots for previously unattributed assessment questions.' : 'Dry run only. Re-run with --apply after reviewing this report.' }, null, 2));
}

if (!process.env.JEST_WORKER_ID) main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
