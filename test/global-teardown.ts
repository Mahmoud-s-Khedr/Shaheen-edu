import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '..', '.testcontainers-env.json');

export default async function globalTeardown(): Promise<void> {
  const containers = (
    globalThis as typeof globalThis & {
      __e2eContainers?: {
        postgres: { stop(): Promise<void> };
        redis: { stop(): Promise<void> };
      };
    }
  ).__e2eContainers;
  await Promise.all([containers?.postgres.stop(), containers?.redis.stop()]);
  if (existsSync(envFile)) rmSync(envFile);
}
