import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QuestionImportWorker } from './modules/ai-question-import/question-import.worker';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const worker = app.get(QuestionImportWorker);
  worker.start();
  const close = async () => { await worker.stop(); await app.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
bootstrap().catch((error) => { console.error('Failed to start AI question import worker', error); process.exit(1); });
