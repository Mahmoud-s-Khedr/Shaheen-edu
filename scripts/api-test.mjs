import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.api-tests.local');
const apiTestPort = process.env.API_TEST_PORT ?? '3101';
const compose = [
  'compose',
  '-f',
  'docker-compose.api-test.yml',
  '-p',
  'shaheen-edu-api-test',
];

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return [];
        const index = trimmed.indexOf('=');
        return index === -1
          ? []
          : [[trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim()]];
      }),
  );
}

function requireSafeProviderConfig(env) {
  const required = [
    'SUPER_ADMIN_EMAIL',
    'SUPER_ADMIN_PASSWORD',
    'BUNNY_STORAGE_BUCKET',
    'BUNNY_STORAGE_ACCESS_KEY_ID',
    'BUNNY_STORAGE_SECRET_ACCESS_KEY',
    'BUNNY_STORAGE_PULL_ZONE_URL',
    'BUNNY_STORAGE_TOKEN_KEY',
    'BUNNY_STREAM_LIBRARY_ID',
    'BUNNY_STREAM_API_KEY',
    'BUNNY_STREAM_READ_ONLY_KEY',
    'BUNNY_STREAM_PLAYER_TOKEN_KEY',
    'API_TEST_BUNNY_WEBHOOK_URL',
  ];
  const missing = required.filter(
    (name) =>
      !env[name] || /replace-me|your-storage-zone|change-me/i.test(env[name]),
  );
  if (missing.length)
    throw new Error(
      `Refusing to run: configure ${missing.join(', ')} in .env.api-tests.local.`,
    );
  for (const value of [
    env.BUNNY_STORAGE_PULL_ZONE_URL,
    env.BUNNY_STORAGE_S3_ENDPOINT,
  ]) {
    const host = new URL(value).hostname.toLowerCase();
    if (/prod|production/.test(host))
      throw new Error(`Refusing production-like provider host: ${host}`);
  }
}

function runDocker(args) {
  execFileSync('docker', [...compose, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
}

if (!existsSync(envPath)) {
  console.error(
    'Missing .env.api-tests.local. Copy .env.api-tests.example and add dedicated non-production Bunny credentials.',
  );
  process.exitCode = 2;
} else {
  const testEnv = parseEnv(envPath);
  try {
    requireSafeProviderConfig(testEnv);
    runDocker(['up', '--build', '--wait']);
    const result = spawnSync('pnpm', ['tsx', 'scripts/run-api-acceptance.ts'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        JOURNEY_ALLOW_MUTATIONS: 'true',
        JOURNEY_BASE_URL: `http://127.0.0.1:${apiTestPort}`,
        JOURNEY_API_PREFIX: '/api/v1',
        JOURNEY_SUPER_ADMIN_EMAIL: testEnv.SUPER_ADMIN_EMAIL,
        JOURNEY_SUPER_ADMIN_PASSWORD: testEnv.SUPER_ADMIN_PASSWORD,
        JOURNEY_BUNNY_WEBHOOK_URL: testEnv.API_TEST_BUNNY_WEBHOOK_URL,
        JOURNEY_BUNNY_READ_ONLY_KEY: testEnv.BUNNY_STREAM_READ_ONLY_KEY,
      },
    });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    try {
      runDocker(['down', '--volumes', '--remove-orphans']);
    } catch {
      console.error(
        'Warning: API test stack cleanup failed; run `docker compose -f docker-compose.api-test.yml -p shaheen-edu-api-test down --volumes`.',
      );
    }
  }
}
