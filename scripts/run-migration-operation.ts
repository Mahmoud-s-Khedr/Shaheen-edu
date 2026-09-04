import { spawn } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

type Operation = 'migrate' | 'bootstrap';

const DEPLOYMENT_LOCK_NAMESPACE = 708_443_611;
const DEPLOYMENT_LOCK_KEY = 1;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

function parseOperation(): Operation {
  const operation = process.argv[2];
  if (operation === 'migrate' || operation === 'bootstrap') {
    return operation;
  }

  throw new Error(
    'Usage: tsx scripts/run-migration-operation.ts <migrate|bootstrap>',
  );
}

function runPnpm(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `pnpm ${args.join(' ')} failed${signal ? ` (signal ${signal})` : ` (exit code ${code ?? 'unknown'})`}.`,
        ),
      );
    });
  });
}

async function assertNoActiveMigration(tx: PrismaClient): Promise<void> {
  const [result] = await tx.$queryRaw<[{ active: boolean }]>`
    SELECT EXISTS (
      SELECT 1
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
    ) AS active
  `;

  if (result?.active) {
    throw new Error(
      'Refusing bootstrap: a Prisma migration is currently active in the database.',
    );
  }
}

async function main(): Promise<void> {
  const operation = parseOperation();
  const prisma = new PrismaClient();

  try {
    await prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<[{ acquired: boolean }]>`
          SELECT pg_try_advisory_xact_lock(
            ${DEPLOYMENT_LOCK_NAMESPACE}::integer,
            ${DEPLOYMENT_LOCK_KEY}::integer
          ) AS acquired
        `;

        if (!lock?.acquired) {
          throw new Error(
            'Refusing deployment operation: a migration or bootstrap operation is already running.',
          );
        }

        if (operation === 'migrate') {
          await runPnpm(['exec', 'prisma', 'migrate', 'deploy']);
          return;
        }

        // `migrate status` exits non-zero for pending, failed, or divergent
        // histories. It must succeed before a bootstrap can change data.
        await runPnpm(['exec', 'prisma', 'migrate', 'status']);
        await assertNoActiveMigration(tx as PrismaClient);
        await runPnpm(['prisma:seed']);
      },
      { maxWait: LOCK_TIMEOUT_MS, timeout: LOCK_TIMEOUT_MS },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Migration/bootstrap operation failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
