import { PrismaClient } from '@prisma/client';
import { computeTwoPhaseRenumber } from '../src/common/hierarchy/hierarchy.helper';

type Command = '--report' | '--check' | '--apply';

type Placement = {
  academicGradeId: string;
  subjectId: string;
  sortOrder: number;
};

const prisma = new PrismaClient();

function command(): Command {
  const value = process.argv[2];
  if (value === '--report' || value === '--check' || value === '--apply') {
    return value;
  }
  throw new Error(
    'Usage: tsx scripts/remediate-subject-grade-ordering.ts <--report|--check|--apply>',
  );
}

async function invalidScopes(): Promise<Placement[][]> {
  const placements = await prisma.subjectGrade.findMany({
    select: { academicGradeId: true, subjectId: true, sortOrder: true },
    orderBy: [
      { academicGradeId: 'asc' },
      { sortOrder: 'asc' },
      { subjectId: 'asc' },
    ],
  });
  const byGrade = new Map<string, Placement[]>();
  for (const placement of placements) {
    const scope = byGrade.get(placement.academicGradeId) ?? [];
    scope.push(placement);
    byGrade.set(placement.academicGradeId, scope);
  }
  return [...byGrade.values()].filter((scope) =>
    scope.some((placement, index) => placement.sortOrder !== index + 1),
  );
}

async function normalize(scope: Placement[]): Promise<void> {
  const academicGradeId = scope[0].academicGradeId;
  const plan = computeTwoPhaseRenumber(
    scope.map((placement, index) => ({
      id: placement.subjectId,
      sortOrder: index + 1,
    })),
  );
  await prisma.$transaction(async (tx) => {
    for (const phase1 of plan.phase1) {
      await tx.subjectGrade.update({
        where: {
          academicGradeId_subjectId: {
            academicGradeId,
            subjectId: phase1.id,
          },
        },
        data: { sortOrder: phase1.sortOrder },
      });
    }
    for (const phase2 of plan.phase2) {
      await tx.subjectGrade.update({
        where: {
          academicGradeId_subjectId: {
            academicGradeId,
            subjectId: phase2.id,
          },
        },
        data: { sortOrder: phase2.sortOrder },
      });
    }
  });
}

async function main(): Promise<void> {
  const mode = command();
  const scopes = await invalidScopes();
  if (mode === '--apply') {
    for (const scope of scopes) await normalize(scope);
  }
  console.log(
    JSON.stringify(
      {
        mode,
        affectedScopeCount: scopes.length,
        repairedScopeCount: mode === '--apply' ? scopes.length : 0,
        scopes: scopes.map((scope) => ({
          academicGradeId: scope[0].academicGradeId,
          placements: scope.map(({ subjectId, sortOrder }) => ({
            subjectId,
            sortOrder,
          })),
        })),
      },
      null,
      2,
    ),
  );
  if (mode === '--check' && scopes.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
