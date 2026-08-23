import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const exampleEnvPath = resolve(root, '.env.example');
const command = process.argv[2];

function run(args) {
  execFileSync('docker', ['compose', ...args], {
    cwd: root,
    stdio: 'inherit',
  });
}

function hasExistingStack() {
  const output = execFileSync('docker', ['compose', 'ps', '-a', '--services'], {
    cwd: root,
    encoding: 'utf8',
  });
  return output.trim().length > 0;
}

function ensureEnvFile() {
  if (!existsSync(envPath)) {
    copyFileSync(exampleEnvPath, envPath);
    console.log(
      'Created .env from .env.example. Update its values before sharing this environment.',
    );
  }
}

switch (command) {
  case 'start':
    ensureEnvFile();
    run(
      hasExistingStack()
        ? ['up', '-d', '--wait']
        : ['up', '-d', '--build', '--wait'],
    );
    break;
  case 'stop':
    run(['stop']);
    break;
  case 'clear':
    console.warn(
      'Removing Shaheen Edu containers, network, PostgreSQL data, and Redis data.',
    );
    run(['down', '--volumes', '--remove-orphans']);
    break;
  case 'update':
    ensureEnvFile();
    run(['up', '-d', '--wait', 'postgres', 'redis']);
    run([
      'up',
      '-d',
      '--build',
      '--force-recreate',
      '--wait',
      'api',
      'ai-question-import-worker',
    ]);
    break;
  default:
    console.error('Usage: node scripts/dev.mjs <start|stop|clear|update>');
    process.exitCode = 1;
}
