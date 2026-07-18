import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CookieJar } from './cookie-jar.js';
import { ApiClient } from './api-client.js';
import { DataFactory } from './data-factory.js';
import { loadEnvironment } from './environment.js';
import { JourneyRunner } from './journey-runner.js';
import { redact } from './redaction.js';
import { expectStatus, JourneyAssertionError } from './assertions.js';
import type { JourneyDefinition } from './types.js';

const saved = { ...process.env };
function env(values: Record<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) if (key.startsWith('JOURNEY_')) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: 'test', JOURNEY_BASE_URL: 'http://localhost:3000', JOURNEY_SUPER_ADMIN_EMAIL: 'admin@example.test', JOURNEY_SUPER_ADMIN_PASSWORD: 'password', JOURNEY_ALLOW_MUTATIONS: 'true', ...values });
}
test.after(() => { process.env = saved; });

test('environment requires mutation opt-in and rejects production targets', () => {
  env({ JOURNEY_ALLOW_MUTATIONS: undefined }); assert.throws(loadEnvironment, /JOURNEY_ALLOW_MUTATIONS/);
  env({ JOURNEY_BASE_URL: 'https://api.production.example.test' }); assert.throws(loadEnvironment, /production-like/);
});

test('cookie jar persists and replaces refresh cookies', () => {
  const jar = new CookieJar(); const first = new Headers(); first.append('set-cookie', 'refresh_token=first; Path=/api/v1/auth; HttpOnly'); jar.absorb(first); assert.match(jar.header()!, /refresh_token=first/);
  const second = new Headers(); second.append('set-cookie', 'refresh_token=second; Path=/api/v1/auth; HttpOnly'); jar.absorb(second); assert.match(jar.header()!, /refresh_token=second/);
});

test('redaction removes sensitive values and factories are unique', () => {
  assert.deepEqual(redact({ password: 'secret', accessToken: 'token', safe: 'value' }), { password: '[REDACTED]', accessToken: '[REDACTED]', safe: 'value' });
  const factory = new DataFactory(); assert.notEqual(factory.email('user'), factory.email('user')); assert.notEqual(factory.phone(), factory.phone()); assert.notEqual(factory.nationalId(), factory.nationalId());
});

test('API client sends isolated bearer token and assertion failures throw', async () => {
  const originalFetch = globalThis.fetch; let authorization = '';
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { authorization = new Headers(init?.headers).get('authorization') ?? ''; return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  try {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000', apiPrefix: '/api/v1', timeoutMs: 1000 }, 'test'); client.accessToken = 'actor-token';
    const response = await client.request('GET', '/auth/me'); assert.equal(authorization, 'Bearer actor-token'); assert.throws(() => expectStatus(response, 201), JourneyAssertionError);
  } finally { globalThis.fetch = originalFetch; }
});

test('runner executes dependencies in order and writes redacted report', async () => {
  env({}); const order: string[] = [];
  const definitions: JourneyDefinition[] = [
    { id: 'A', name: 'A', category: 'auth', run: async () => { order.push('A'); } },
    { id: 'B', name: 'B', category: 'auth', dependsOn: ['A'], run: async () => { order.push('B'); } },
  ];
  const runner = new JourneyRunner(loadEnvironment(), definitions, { verbose: false, quiet: true }); const results = await runner.execute([definitions[1]]); assert.deepEqual(order, ['A', 'B']); assert.equal(results.every((result) => result.status === 'passed'), true); assert.match(await runner.writeReport(results), /reports\/journeys/);
});
