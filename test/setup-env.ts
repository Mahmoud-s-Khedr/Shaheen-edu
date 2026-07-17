import * as fs from 'fs';
import * as path from 'path';

// Global setup writes the disposable Testcontainers connection details before
// Jest workers load this module or import the Nest application.
const envPath = path.resolve(__dirname, '..', '.testcontainers-env.json');
if (!fs.existsSync(envPath)) {
  throw new Error(
    'Missing e2e environment. Run tests through `pnpm test:e2e`.',
  );
}
Object.assign(process.env, JSON.parse(fs.readFileSync(envPath, 'utf8')));
