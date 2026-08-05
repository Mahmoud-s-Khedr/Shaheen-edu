import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CookieJar } from './cookie-jar.js';
import { ApiClient } from './api-client.js';
import { DataFactory } from './data-factory.js';
import { loadEnvironment } from './environment.js';
import { JourneyRunner } from './journey-runner.js';
import { redact } from './redaction.js';
import { expectStatus, JourneyAssertionError } from './assertions.js';
import { fetchDeliveryUrl, getDeliveryFetches, resetDeliveryFetches } from './delivery.js';
import { operationTemplateFor } from '../../api-testing/operation-path.js';
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

test('operation template matching prefers static paths over parameters', () => {
  const paths = {
    '/api/v1/admin/content-items/{id}': {},
    '/api/v1/admin/content-items/reorder': {},
    '/api/v1/admin/questions/{id}/options/{optionId}': {},
    '/api/v1/admin/questions/{id}/options/reorder': {},
  };
  assert.equal(
    operationTemplateFor('/api/v1/admin/content-items/reorder', paths),
    '/api/v1/admin/content-items/reorder',
  );
  assert.equal(
    operationTemplateFor('/api/v1/admin/questions/q1/options/reorder', paths),
    '/api/v1/admin/questions/{id}/options/reorder',
  );
  assert.equal(
    operationTemplateFor('/api/v1/admin/content-items/item1', paths),
    '/api/v1/admin/content-items/{id}',
  );
});

test('API client sends isolated bearer token and records complete exchanges', async () => {
  const originalFetch = globalThis.fetch; let authorization = ''; let signature = ''; const operations: import('./types.js').OperationRecord[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { const headers = new Headers(init?.headers); authorization = headers.get('authorization') ?? ''; signature = headers.get('x-test-signature') ?? ''; return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
  try {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000', apiPrefix: '/api/v1', timeoutMs: 1000 }, 'test', undefined, (record) => operations.push(record)); client.accessToken = 'actor-token';
    const response = await client.request('POST', '/auth/me', { password: 'test-password' }); assert.equal(authorization, 'Bearer actor-token'); assert.throws(() => expectStatus(response, 201), JourneyAssertionError);
    await client.request('POST', '/webhook', undefined, { rawBody: '{}', headers: { 'x-test-signature': 'signed' }, track: false });
    assert.equal(signature, 'signed'); assert.equal(operations.length, 1);
    assert.deepEqual(operations[0].request, { headers: { accept: 'application/json', authorization: 'Bearer actor-token', 'content-type': 'application/json', 'x-correlation-id': operations[0].correlationId }, body: { password: 'test-password' } });
    assert.deepEqual(operations[0].response, { headers: { 'content-type': 'application/json' }, body: { ok: true } });
  } finally { globalThis.fetch = originalFetch; }
});

test('asset upload retains the legacy multipart endpoint around the direct Bunny flow', async () => {
  const originalFetch = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.endsWith('/api/v1/admin/assets/upload?kind=PDF')) return new Response(JSON.stringify({ asset: { id: 'asset-1' }, upload: { url: 'https://bunny.example.test/upload', method: 'PUT', headers: { 'content-type': 'application/pdf' } } }), { status: 201, headers: { 'content-type': 'application/json' } });
    if (url === 'https://bunny.example.test/upload') return new Response('', { status: 201 });
    if (url.endsWith('/api/v1/admin/assets/asset-1/complete')) return new Response(JSON.stringify({ id: 'asset-1', status: 'READY' }), { status: 201, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  try {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000', apiPrefix: '/api/v1', timeoutMs: 1000 }, 'test');
    const result = await client.upload<{ id: string; status: string }>('/admin/assets/upload?kind=PDF', { buffer: Buffer.from('%PDF-'), filename: 'lesson.pdf', contentType: 'application/pdf' }, { expected: 201 });
    assert.deepEqual(result.body, { id: 'asset-1', status: 'READY' });
    assert.deepEqual(calls, ['http://localhost:3000/api/v1/admin/assets/upload?kind=PDF', 'https://bunny.example.test/upload', 'http://localhost:3000/api/v1/admin/assets/asset-1/complete']);
  } finally { globalThis.fetch = originalFetch; }
});

test('payment-proof upload retains its legacy order endpoint for authorization and confirmation', async () => {
  const originalFetch = globalThis.fetch; const calls: Array<{ url: string; body?: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.endsWith('/api/v1/student/orders/order-1/payment-proof') && !(typeof init?.body === 'string')) return new Response(JSON.stringify({ asset: { id: 'proof-1' }, upload: { url: 'https://bunny.example.test/proof', method: 'PUT', headers: { 'content-type': 'image/jpeg' } } }), { status: 201, headers: { 'content-type': 'application/json' } });
    if (url === 'https://bunny.example.test/proof') return new Response('', { status: 201 });
    if (url.endsWith('/api/v1/student/orders/order-1/payment-proof/complete')) return new Response(JSON.stringify({ id: 'submission-1', status: 'SUBMITTED' }), { status: 201, headers: { 'content-type': 'application/json' } });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  try {
    const client = new ApiClient({ baseUrl: 'http://localhost:3000', apiPrefix: '/api/v1', timeoutMs: 1000 }, 'test');
    const result = await client.upload<{ id: string; status: string }>('/student/orders/order-1/payment-proof', { buffer: Buffer.from([0xff, 0xd8, 0xff]), filename: 'receipt.jpg', contentType: 'image/jpeg' }, { expected: 201, fields: { transactionReference: 'REF-1' } });
    assert.deepEqual(result.body, { id: 'submission-1', status: 'SUBMITTED' });
    assert.deepEqual(JSON.parse(calls[2].body ?? '{}'), { assetId: 'proof-1', transactionReference: 'REF-1' });
  } finally { globalThis.fetch = originalFetch; }
});

test('delivery URL fetch consumes a successful non-empty response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('asset-bytes', { status: 200 })) as typeof fetch;
  try {
    resetDeliveryFetches();
    await fetchDeliveryUrl('https://cdn.example.test/asset.pdf', 'PDF delivery');
    assert.deepEqual(getDeliveryFetches(), [{ label: 'PDF delivery', url: 'https://cdn.example.test/asset.pdf', status: 200, fileSize: 11 }]);
  }
  finally { globalThis.fetch = originalFetch; }
});

test('delivery URL fetch rejects failed and empty responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response('', { status: 403 })) as typeof fetch;
    await assert.rejects(() => fetchDeliveryUrl('https://cdn.example.test/asset.pdf', 'Denied delivery'), /resolve/);
    globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch;
    await assert.rejects(() => fetchDeliveryUrl('https://cdn.example.test/asset.pdf', 'Empty delivery'), /non-empty/);
  } finally { globalThis.fetch = originalFetch; }
});

test('runner executes dependencies in order and writes a report', async () => {
  env({}); const order: string[] = [];
  const definitions: JourneyDefinition[] = [
    { id: 'A', name: 'A', category: 'auth', run: async () => { order.push('A'); } },
    { id: 'B', name: 'B', category: 'auth', dependsOn: ['A'], run: async () => { order.push('B'); } },
  ];
  const runner = new JourneyRunner(loadEnvironment(), definitions, { verbose: false, quiet: true }); const results = await runner.execute([definitions[1]]); assert.deepEqual(order, ['A', 'B']); assert.equal(results.every((result) => result.status === 'passed'), true); assert.match(await runner.writeReport(results), /reports\/journeys/);
});
