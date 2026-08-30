import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import { AppModule } from './app.module';
import { QuestionImportWorker } from './modules/ai-question-import/question-import.worker';
import { ReportExportWorker } from './modules/reports/report-export.worker';
import type { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
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
    console.error('Worker lost queue readiness; restarting process');
    void close().finally(() => process.exit(1));
  }, 30_000);
  healthMonitor.unref();
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
bootstrap().catch((error) => {
  console.error('Failed to start AI question import worker', error);
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
