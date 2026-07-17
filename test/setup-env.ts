import * as fs from 'fs';
import * as path from 'path';

// Loads .env.test (a separate DB/redis-db from local dev) before any test
// module imports the app, so ConfigModule/Joi validation see the right
// values. Deliberately not using the `dotenv` package (not a listed
// dependency) - this is a tiny inline parser sufficient for KEY=VALUE lines.
const envPath = path.resolve(__dirname, '..', '.env.test');
if (fs.existsSync(envPath)) {
  const contents = fs.readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    process.env[key] = value;
  }
}
