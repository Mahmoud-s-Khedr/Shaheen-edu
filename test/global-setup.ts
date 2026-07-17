import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';

const envFile = resolve(__dirname, '..', '.testcontainers-env.json');

declare global {
  // Jest runs global teardown in the same coordinator process as setup.
  var __e2eContainers:
    { postgres: StartedTestContainer; redis: StartedTestContainer } | undefined;
}

function testEnvironment(
  databaseUrl: string,
  redisUrl: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    CORS_ORIGINS: 'http://localhost:3000',
    COOKIE_SECURE: 'false',
    COOKIE_SECRET: 'test_cookie_secret_at_least_32_characters_long',
    JWT_ACCESS_SECRET: 'test_access_secret_at_least_32_characters_long',
    JWT_ACCESS_TTL_SECONDS: '900',
    JWT_REFRESH_TTL_SECONDS: '2592000',
    JWT_PARENT_ACCESS_SECRET: 'test_parent_secret_at_least_32_characters',
    JWT_PARENT_ACCESS_TTL_SECONDS: '1800',
    NATIONAL_ID_HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long',
    NATIONAL_ID_ENCRYPTION_KEY: 'test_encryption_key_at_least_32_characters',
    NATIONAL_ID_KEY_VERSION: '1',
    SUPER_ADMIN_EMAIL: 'superadmin@example.com',
    SUPER_ADMIN_PASSWORD: 'TestPassword123!',
  };
}

export default async function globalSetup(): Promise<void> {
  let postgres: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;

  try {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'edu',
        POSTGRES_PASSWORD: 'edu_test_password',
        POSTGRES_DB: 'edu_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections'),
      )
      .start();
    redis = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();

    const databaseUrl = `postgresql://edu:edu_test_password@${postgres.getHost()}:${postgres.getMappedPort(5432)}/edu_test?schema=public`;
    const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/0`;
    const env = testEnvironment(databaseUrl, redisUrl);

    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '..'),
      env,
      stdio: 'inherit',
    });
    writeFileSync(envFile, JSON.stringify(env), { mode: 0o600 });
    globalThis.__e2eContainers = { postgres, redis };
  } catch (error) {
    await Promise.all([postgres?.stop(), redis?.stop()]);
    throw new Error(
      `Unable to start e2e dependencies. Ensure Docker is running and available to Testcontainers.\n${String(error)}`,
    );
  }
}
