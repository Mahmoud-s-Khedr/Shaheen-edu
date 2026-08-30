import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import { Logger as PinoNestLogger, PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { QuestionImportWorker } from './modules/ai-question-import/question-import.worker';
import { ReportExportWorker } from './modules/reports/report-export.worker';
import type { AppConfig } from './config/configuration';
import { safeErrorRecord } from './common/logging/error-record';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // PinoLogger is transient-scoped; application contexts must resolve scoped
  // providers rather than retrieve them with app.get().
  const logger = await app.resolve(PinoLogger);
  // Application contexts do not install the configured logger automatically.
  // Set it before resolving workers so their Nest Logger instances emit the
  // same structured Pino records as the HTTP application.
  app.useLogger(app.get(PinoNestLogger));
  app.enableShutdownHooks();
  const questionImportWorker = app.get(QuestionImportWorker);
  const reportExportWorker = app.get(ReportExportWorker);
  await questionImportWorker.start();
  await reportExportWorker.start();
  const config = app.get(ConfigService<AppConfig, true>);
  const healthServer = createWorkerHealthServer(
    questionImportWorker,
    reportExportWorker,
  );
  await new Promise<void>((resolve, reject) => {
    healthServer.once('error', reject);
    healthServer.listen(
      config.get('workerHealthPort', { infer: true }),
      '127.0.0.1',
      resolve,
    );
  });
  logger.info(
    {
      event: 'worker_started',
      context: 'WorkerBootstrap',
      service: 'worker',
      queues: [
        'question-import',
        'question-import-page',
        'question-import-chunk',
        'report-export',
      ],
      release: process.env.RELEASE_REVISION ?? 'unknown',
    },
    'Worker started',
  );
  let closing = false;
  let healthMonitor: NodeJS.Timeout | undefined;
  const close = async () => {
    if (closing) return;
    closing = true;
    if (healthMonitor) clearInterval(healthMonitor);
    healthServer.close();
    await Promise.all([questionImportWorker.stop(), reportExportWorker.stop()]);
    await app.close();
  };
  healthMonitor = setInterval(() => {
    if (questionImportWorker.isHealthy() && reportExportWorker.isHealthy())
      return;
    logger.error(
      {
        event: 'worker_queue_readiness_lost',
        context: 'WorkerBootstrap',
        service: 'worker',
        release: process.env.RELEASE_REVISION ?? 'unknown',
      },
      'Worker lost queue readiness; restarting process',
    );
    void close().finally(() => process.exit(1));
  }, 30_000);
  healthMonitor.unref();
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
bootstrap().catch((error: unknown) => {
  // Bootstrap may fail before Nest's Pino logger is available. Preserve a
  // structured record and omit the raw exception message for the same privacy
  // policy used by the running services.
  console.error(
    JSON.stringify({
      event: 'worker_bootstrap_failed',
      service: 'worker',
      ...safeErrorRecord(error),
      release: process.env.RELEASE_REVISION ?? 'unknown',
    }),
  );
  process.exit(1);
});

function createWorkerHealthServer(
  questionImportWorker: QuestionImportWorker,
  reportExportWorker: ReportExportWorker,
): Server {
  return createServer((request, response) => {
    if (
      request.method !== 'GET' ||
      !['/health', '/health/ready'].includes(request.url ?? '')
    ) {
      response.writeHead(404).end();
      return;
    }
    const questionImport = questionImportWorker.isHealthy();
    const reportExports = reportExportWorker.isHealthy();
    const ready = questionImport && reportExports;
    response
      .writeHead(ready ? 200 : 503, { 'content-type': 'application/json' })
      .end(
        JSON.stringify({
          status: ready ? 'ready' : 'unready',
          workers: { questionImport, reportExports },
        }),
      );
  });
}
