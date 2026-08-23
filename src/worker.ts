import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QuestionImportWorker } from './modules/ai-question-import/question-import.worker';
import { ReportExportWorker } from './modules/reports/report-export.worker';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const questionImportWorker = app.get(QuestionImportWorker);
  const reportExportWorker = app.get(ReportExportWorker);
  questionImportWorker.start(); reportExportWorker.start();
  const close = async () => { await Promise.all([questionImportWorker.stop(), reportExportWorker.stop()]); await app.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
bootstrap().catch((error) => { console.error('Failed to start AI question import worker', error); process.exit(1); });
