/*
 * Rebuild BullMQ work from PostgreSQL after an intentional fresh-Redis
 * recovery. It refuses a non-empty Redis database so it cannot silently add
 * duplicate work to a live deployment.
 */
import {
  PrismaClient,
  QuestionImportStatus,
  ReportExportStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const confirmation = '--confirm-empty-redis';
if (!process.argv.slice(2).includes(confirmation)) {
  console.error(`Refusing queue recovery without ${confirmation}.`);
  process.exit(64);
}

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  console.error('DATABASE_URL and REDIS_URL are required.');
  process.exit(78);
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const recoveryMarker = 'shaheen:queue-recovery:in-progress';
const questionImports = new Queue('ai-question-import', {
  connection: { url: redisUrl },
});
const reportExports = new Queue('report-export', {
  connection: { url: redisUrl },
});

async function recover() {
  const keys = await redis.dbsize();
  const resuming = (await redis.get(recoveryMarker)) === '1';
  if (!resuming && keys !== 0) {
    throw new Error(
      `Refusing queue recovery: Redis database has ${keys} key(s), not zero.`,
    );
  }
  if (!resuming) await redis.set(recoveryMarker, '1', 'NX');

  const batches = await prisma.$transaction(async (tx) => {
    await tx.questionImportBatch.updateMany({
      where: {
        status: {
          in: [
            QuestionImportStatus.QUEUED,
            QuestionImportStatus.EXTRACTING,
            QuestionImportStatus.TRANSCRIBING,
            QuestionImportStatus.SEGMENTING,
            QuestionImportStatus.GENERATING,
          ],
        },
      },
      data: {
        status: QuestionImportStatus.QUEUED,
        errorSummary: 'Requeued after confirmed fresh Redis recovery',
        completedAt: null,
      },
    });
    return tx.questionImportBatch.findMany({
      where: { status: QuestionImportStatus.QUEUED },
      select: { id: true },
    });
  });

  const exports = await prisma.$transaction(async (tx) => {
    await tx.reportExportJob.updateMany({
      where: {
        status: {
          in: [ReportExportStatus.QUEUED, ReportExportStatus.PROCESSING],
        },
      },
      data: { status: ReportExportStatus.QUEUED, error: null },
    });
    return tx.reportExportJob.findMany({
      where: { status: ReportExportStatus.QUEUED },
      select: { id: true },
    });
  });

  for (const batch of batches) {
    await questionImports.add(
      'process',
      { batchId: batch.id },
      {
        // This makes an interrupted recovery resumable without creating a
        // second coordinator job for the same durable batch.
        jobId: `recovery-${batch.id}`,
        attempts: 10,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
  }
  for (const job of exports) {
    await reportExports.add(
      'generate',
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 1000,
      },
    );
  }

  await redis.del(recoveryMarker);

  console.log(
    JSON.stringify({
      event: 'redis_queue_recovery_completed',
      questionImportBatches: batches.length,
      reportExports: exports.length,
    }),
  );
}

recover()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'redis_queue_recovery_failed',
        reason: error instanceof Error ? error.message : 'unknown_error',
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([questionImports.close(), reportExports.close()]);
    await redis.quit();
    await prisma.$disconnect();
  });
