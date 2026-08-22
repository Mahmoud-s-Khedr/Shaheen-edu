import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  compareOperationKeys,
  markdownOperationKeys,
  operationKeys,
} from './api-contract-check.js';
import { loadOperationManifest } from './api-testing/operation-manifest.js';
import { operationTemplateFor } from './api-testing/operation-path.js';
import { loadEnvironment } from './journeys/lib/environment.js';
import { JourneyRunner } from './journeys/lib/journey-runner.js';
import { journeys } from './journeys/current-system.journey.js';

type Schema = {
  $ref?: string;
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  enum?: unknown[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  nullable?: boolean;
};
type OpenApiOperation = {
  responses?: Record<string, { content?: Record<string, { schema?: Schema }> }>;
};
type OpenApiDocument = {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, Schema> };
};

type RemoteCleanupResult = {
  resource: 'cover' | 'content-item' | 'video-asset' | 'asset';
  id: string;
  status?: number;
  error?: string;
};

function dereference(
  schema: Schema | undefined,
  document: OpenApiDocument,
): Schema | undefined {
  if (!schema?.$ref) return schema;
  const prefix = '#/components/schemas/';
  return schema.$ref.startsWith(prefix)
    ? document.components?.schemas?.[schema.$ref.slice(prefix.length)]
    : undefined;
}

function schemaErrors(
  value: unknown,
  schema: Schema | undefined,
  document: OpenApiDocument,
  location = '$',
): string[] {
  schema = dereference(schema, document);
  if (!schema) return [];
  if (value === null && schema.nullable) return [];
  if (schema.enum && !schema.enum.some((candidate) => candidate === value))
    return [`${location} must be one of ${schema.enum.map(String).join(', ')}`];
  if (schema.allOf)
    return schema.allOf.flatMap((part) =>
      schemaErrors(value, part, document, location),
    );
  if (schema.anyOf) {
    const variants = schema.anyOf.map((part) =>
      schemaErrors(value, part, document, location),
    );
    if (variants.some((errors) => errors.length === 0)) return [];
    return [`${location} must match at least one documented schema`];
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (part) => schemaErrors(value, part, document, location).length === 0,
    ).length;
    if (matches === 1) return [];
    return [`${location} must match exactly one documented schema`];
  }
  if (
    schema.type === 'object' &&
    (value === null || typeof value !== 'object' || Array.isArray(value))
  )
    return [`${location} must be an object`];
  if (schema.type === 'array' && !Array.isArray(value))
    return [`${location} must be an array`];
  if (schema.type === 'string' && typeof value !== 'string')
    return [`${location} must be a string`];
  if (schema.type === 'number' && typeof value !== 'number')
    return [`${location} must be a number`];
  if (schema.type === 'boolean' && typeof value !== 'boolean')
    return [`${location} must be a boolean`];
  if (
    schema.type === 'number' &&
    typeof value === 'number' &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    return [`${location} is outside documented numeric bounds`];
  if (
    schema.type === 'string' &&
    typeof value === 'string' &&
    ((schema.minLength !== undefined && value.length < schema.minLength) ||
      (schema.maxLength !== undefined && value.length > schema.maxLength))
  )
    return [`${location} is outside documented string length bounds`];
  if (schema.type === 'array' && schema.items && Array.isArray(value))
    return value.flatMap((item, index) =>
      schemaErrors(item, schema.items, document, `${location}[${index}]`),
    );
  if (
    schema.type === 'object' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>;
    const missing = (schema.required ?? [])
      .filter((name) => !(name in record))
      .map((name) => `${location}.${name} is required`);
    return [
      ...missing,
      ...Object.entries(schema.properties ?? {}).flatMap(([name, property]) =>
        name in record
          ? schemaErrors(
              record[name],
              property,
              document,
              `${location}.${name}`,
            )
          : [],
      ),
    ];
  }
  return [];
}

function responseSchema(
  document: OpenApiDocument,
  template: string,
  method: string,
  status: number,
): Schema | undefined {
  return document.paths[template]?.[method.toLowerCase()]?.responses?.[
    String(status)
  ]?.content?.['application/json']?.schema;
}

function createdIds(
  calls: readonly {
    method: string;
    path: string;
    status: number;
    body: unknown;
  }[],
  expression: RegExp,
): string[] {
  return [
    ...new Set(
      calls.flatMap((call) => {
        if (
          call.method !== 'POST' ||
          call.status < 200 ||
          call.status >= 300 ||
          !expression.test(call.path) ||
          !call.body ||
          typeof call.body !== 'object' ||
          typeof (call.body as { id?: unknown }).id !== 'string'
        )
          return [];
        return [(call.body as { id: string }).id];
      }),
    ),
  ];
}

async function cleanupRemoteResources(
  runner: JourneyRunner,
): Promise<RemoteCleanupResult[]> {
  const calls = runner.getOperations();
  const contentItems = createdIds(calls, /\/admin\/content-items(?:\?|$)/);
  const videos = createdIds(calls, /\/admin\/video-assets(?:\?|$)/);
  const coverTargets = [
    ...new Set(
      calls.flatMap((call) => {
        const match = call.path.match(
          /^\/api\/v1\/admin\/assets\/covers\/(grades|subjects|courses|chapters|lessons|sections)\/([^/?]+)(?:\?|$)/,
        );
        return call.method === 'POST' &&
          call.status >= 200 &&
          call.status < 300 &&
          match
          ? [`${match[1]}/${match[2]}`]
          : [];
      }),
    ),
  ];
  const deletedVideos = new Set(
    calls
      .filter(
        (call) =>
          call.method === 'DELETE' &&
          call.status >= 200 &&
          call.status < 300 &&
          /^\/api\/v1\/admin\/video-assets\/[^/?]+(?:\?|$)/.test(call.path),
      )
      .map((call) => call.path.split('?')[0].split('/').at(-1)!),
  );
  const assets = createdIds(calls, /\/admin\/assets\/upload(?:\?|$)/);
  const admin = runner.getClient('admin');
  const cleanup: RemoteCleanupResult[] = [];
  const remove = async (
    resource: RemoteCleanupResult['resource'],
    id: string,
    path: string,
  ) => {
    try {
      // Cleanup is operational hygiene, not evidence that an endpoint was
      // asserted by the acceptance suite.
      const response = await admin.request('DELETE', path, undefined, {
        track: false,
      });
      cleanup.push({ resource, id, status: response.status });
    } catch (error) {
      cleanup.push({
        resource,
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  for (const target of coverTargets)
    await remove('cover', target, `/admin/assets/covers/${target}`);
  for (const id of contentItems) {
    try {
      const current = await admin.request<{ status?: string }>(
        'GET',
        `/admin/content-items/${id}`,
        undefined,
        { track: false },
      );
      if (current.status === 404) {
        cleanup.push({ resource: 'content-item', id, status: 404 });
        continue;
      }
      if (current.status !== 200 || !current.body?.status) {
        cleanup.push({ resource: 'content-item', id, status: current.status });
        continue;
      }
      if (current.body.status !== 'DRAFT') {
        const archived = await admin.request(
          'POST',
          `/admin/content-items/${id}/archive`,
          undefined,
          { track: false },
        );
        if (![201, 409].includes(archived.status)) {
          cleanup.push({
            resource: 'content-item',
            id,
            status: archived.status,
          });
          continue;
        }
        const restored = await admin.request(
          'POST',
          `/admin/content-items/${id}/restore`,
          undefined,
          { track: false },
        );
        if (restored.status !== 201) {
          cleanup.push({
            resource: 'content-item',
            id,
            status: restored.status,
          });
          continue;
        }
      }
      await remove('content-item', id, `/admin/content-items/${id}`);
    } catch (error) {
      cleanup.push({
        resource: 'content-item',
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  for (const id of videos.filter((id) => !deletedVideos.has(id)))
    await remove('video-asset', id, `/admin/video-assets/${id}`);
  for (const id of assets) await remove('asset', id, `/admin/assets/${id}`);
  return cleanup;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const snapshot = JSON.parse(
    await readFile(resolve(root, 'docs-json.json'), 'utf8'),
  ) as OpenApiDocument;
  const markdown = await readFile(
    resolve(root, 'docs/api-reference-detailed.md'),
    'utf8',
  );
  const snapshotKeys = operationKeys(snapshot);
  const markdownDiff = compareOperationKeys(
    snapshotKeys,
    markdownOperationKeys(markdown),
  );
  if (markdownDiff.missing.length || markdownDiff.extra.length)
    throw new Error(
      'docs/api-reference-detailed.md does not match docs-json.json; run `pnpm api:contract:check` for details.',
    );

  const environment = loadEnvironment();
  const runtimeResponse = await fetch(`${environment.baseUrl}/api/docs-json`);
  if (!runtimeResponse.ok)
    throw new Error(
      `Runtime OpenAPI fetch failed with HTTP ${runtimeResponse.status}`,
    );
  const runtime = (await runtimeResponse.json()) as OpenApiDocument;
  const runtimeDiff = compareOperationKeys(
    snapshotKeys,
    operationKeys(runtime),
  );
  if (runtimeDiff.missing.length || runtimeDiff.extra.length)
    throw new Error(
      `Runtime OpenAPI differs from docs-json.json. Missing: ${runtimeDiff.missing.join(', ') || 'none'}; extra: ${runtimeDiff.extra.join(', ') || 'none'}`,
    );

  const manifest = await loadOperationManifest();
  const runner = new JourneyRunner(environment, journeys, {
    verbose: process.env.JOURNEY_VERBOSE === 'true',
    quiet: false,
  });
  const started = performance.now();
  let results;
  let runError: unknown;
  try {
    results = await runner.execute(journeys);
  } catch (error) {
    runError = error;
    results = await runner.execute([]);
  }

  const cleanup = await cleanupRemoteResources(runner);

  const calls = runner.getOperations();
  const coverage = manifest.map((entry) => {
    const [method] = entry.key.split(' ', 1);
    const path = entry.key.slice(method.length + 1);
    const matching = calls.filter(
      (call) =>
        call.method === method &&
        operationTemplateFor(call.path, snapshot.paths) === path,
    );
    const schemaFailures = matching.flatMap((call) =>
      schemaErrors(
        call.body,
        // Validate responses against the checked-in API contract. Deployments can
        // temporarily expose stale Swagger metadata while returning the current
        // response shape; the repository contract remains the test oracle.
        responseSchema(snapshot, path, method, call.status),
        snapshot,
      ).map((error) => `${call.status}: ${error}`),
    );
    return {
      ...entry,
      calls: matching.length,
      statuses: [...new Set(matching.map((call) => call.status))].sort(),
      schemaFailures,
    };
  });
  const requiredCoverage = coverage.filter((entry) => !entry.deferredReason);
  const deferred = coverage
    .filter((entry) => entry.deferredReason)
    .map(({ key, deferredReason }) => ({ key, reason: deferredReason! }));
  const uncovered = requiredCoverage
    .filter((entry) => entry.calls === 0)
    .map((entry) => entry.key);
  const invalidResponses = coverage.filter(
    (entry) => entry.schemaFailures.length > 0,
  );
  const directory = resolve(root, 'reports', 'api-tests');
  await mkdir(directory, { recursive: true });
  const reportPath = resolve(
    directory,
    `api-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  // Journey reports are ignored development test artifacts. Keep raw exchanges here
  // so failed development runs can be reproduced, including credentials and
  // session material generated by the test itself.
  const report = {
    target: environment.baseUrl,
    durationMs: performance.now() - started,
    operationCount: manifest.length,
    requiredOperationCount: requiredCoverage.length,
    exercised: requiredCoverage.length - uncovered.length,
    uncovered,
    deferred,
    invalidResponses,
    cleanup,
    deliveryFetches: runner.getDeliveryFetches(),
    journeys: results,
    calls,
    coverage,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(
    `\nAPI acceptance: ${requiredCoverage.length - uncovered.length}/${requiredCoverage.length} required operations exercised; ${deferred.length} deferred; ${invalidResponses.length} response-schema failures.`,
  );
  console.log(`JSON report: ${reportPath}`);
  const cleanupFailures = cleanup.filter(
    (entry) =>
      // A resource already deleted (404) or still protected by a live
      // association (409) is expected during best-effort external cleanup.
      entry.error ||
      !entry.status ||
      (entry.status >= 300 && ![404, 409].includes(entry.status)),
  );
  if (
    runError ||
    uncovered.length ||
    invalidResponses.length ||
    cleanupFailures.length
  ) {
    process.exitCode = 1;
    if (uncovered.length)
      console.error(
        `Uncovered operations (${uncovered.length}): ${uncovered.join(', ')}`,
      );
    if (runError)
      console.error(
        `Journey failure: ${runError instanceof Error ? runError.message : String(runError)}`,
      );
    if (cleanupFailures.length)
      console.error(
        `Remote cleanup failures (${cleanupFailures.length}); see JSON report.`,
      );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
