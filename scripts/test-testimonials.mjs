import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.api-tests.local');
const compose = [
  'compose',
  '-f',
  'docker-compose.api-test.yml',
  '-p',
  'shaheen-edu-testimonials',
];

function docker(args) {
  execFileSync('docker', [...compose, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, COMPOSE_PROGRESS: 'plain' },
  });
}

if (!existsSync(envPath)) {
  console.error(
    'Missing .env.api-tests.local. Copy .env.api-tests.example and configure the application secrets.',
  );
  process.exitCode = 2;
} else {
  try {
    // Build both images: `up ... api` alone would leave the one-shot journey
    // image cached, even when its TypeScript scenario has changed.
    docker(['build', 'api', 'journey']);
    // `api` waits for MinIO bucket setup, migrations, seeding, and readiness.
    docker(['up', '--wait', 'api']);
    const result = spawnSync(
      'docker',
      [
        ...compose,
        'run',
        '--rm',
        '--no-deps',
        'journey',
        'pnpm',
        'journey:content:testimonials',
        '--verbose',
      ],
      { cwd: root, stdio: 'inherit' },
    );
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    try {
      docker(['down', '--volumes', '--remove-orphans']);
    } catch {
      console.error(
        'Warning: cleanup failed; run docker compose -f docker-compose.api-test.yml -p shaheen-edu-testimonials down --volumes.',
      );
    }
  }
}
