import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../../src/app.factory';

/**
 * Uses the real server bootstrap so e2e tests exercise production routing,
 * middleware, validation, and error-shape behavior via Fastify app.inject().
 */
export async function createTestApp(): Promise<NestFastifyApplication> {
  const app = await createApp({ enableLogging: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
