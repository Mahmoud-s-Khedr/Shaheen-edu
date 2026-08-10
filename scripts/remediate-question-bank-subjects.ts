import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

type Mapping = {
  empty?: Record<string, string>;
  mixed?: Record<string, { primarySubjectId: string; splitSubjects: Record<string, string> }>;
};

type LegacyBank = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdById: string;
  updatedById: string;
  subjectIds: string[];
};

const prisma = new PrismaClient();

function usage() {
  return `Usage:
  tsx scripts/remediate-question-bank-subjects.ts --report
  tsx scripts/remediate-question-bank-subjects.ts --check
  tsx scripts/remediate-question-bank-subjects.ts --apply path/to/mappings.json

Mapping format:
{
  "empty": { "bank-id": "subject-id" },
  "mixed": {
    "bank-id": {
      "primarySubjectId": "subject-id",
      "splitSubjects": { "other-subject-id": "New bank title" }
    }
  }
}`;
}

async function unresolvedBanks(): Promise<LegacyBank[]> {
  const banks = await prisma.questionBank.findMany({
    where: { subjectId: null },
    include: { questions: { select: { course: { select: { subjectId: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return banks.map((bank) => ({
    id: bank.id,
    title: bank.title,
    description: bank.description,
    status: bank.status,
    publishedAt: bank.publishedAt,
    archivedAt: bank.archivedAt,
    createdById: bank.createdById,
    updatedById: bank.updatedById,
    subjectIds: [...new Set(bank.questions.map((question) => question.course.subjectId))].sort(),
  }));
}

function report(banks: LegacyBank[]) {
  return {
    unresolvedCount: banks.length,
    empty: banks.filter((bank) => !bank.subjectIds.length).map(({ id, title }) => ({ id, title })),
    mixed: banks.filter((bank) => bank.subjectIds.length > 1).map(({ id, title, subjectIds }) => ({ id, title, subjectIds })),
  };
}

async function applyMappings(mappings: Mapping) {
  const banks = await unresolvedBanks();
  for (const bank of banks) {
    if (!bank.subjectIds.length) {
      const subjectId = mappings.empty?.[bank.id];
      if (!subjectId) continue;
      await prisma.questionBank.update({ where: { id: bank.id }, data: { subjectId } });
      continue;
    }
    if (bank.subjectIds.length === 1) continue;
    const mapping = mappings.mixed?.[bank.id];
    if (!mapping) continue;
    const mappedSubjects = [mapping.primarySubjectId, ...Object.keys(mapping.splitSubjects)].sort();
    if (mappedSubjects.length !== bank.subjectIds.length || mappedSubjects.some((subjectId, index) => subjectId !== bank.subjectIds[index])) {
      throw new Error(`Mixed bank ${bank.id} must map every existing subject exactly once`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.questionBank.update({ where: { id: bank.id }, data: { subjectId: mapping.primarySubjectId } });
      for (const [subjectId, title] of Object.entries(mapping.splitSubjects)) {
        const split = await tx.questionBank.create({
          data: {
            subjectId,
            title,
            description: bank.description,
            status: bank.status as never,
            publishedAt: bank.publishedAt,
            archivedAt: bank.archivedAt,
            createdById: bank.createdById,
            updatedById: bank.updatedById,
          },
        });
        await tx.question.updateMany({ where: { bankId: bank.id, course: { subjectId } }, data: { bankId: split.id } });
      }
    });
  }
}

async function main() {
  const [command, mappingPath] = process.argv.slice(2);
  if (!command || !['--report', '--check', '--apply'].includes(command) || (command === '--apply' && !mappingPath)) throw new Error(usage());
  if (command === '--apply') {
    const mappings = JSON.parse(await readFile(mappingPath, 'utf8')) as Mapping;
    await applyMappings(mappings);
  }
  const summary = report(await unresolvedBanks());
  console.log(JSON.stringify(summary, null, 2));
  if (command === '--check' && summary.unresolvedCount) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
