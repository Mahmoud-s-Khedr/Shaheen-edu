import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type OpenApiDocument = {
  paths: Record<string, Record<string, unknown>>;
};

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

export function operationKeys(document: OpenApiDocument): string[] {
  return Object.entries(document.paths)
    .flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) => HTTP_METHODS.has(method.toLowerCase()))
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
}

export function markdownOperationKeys(markdown: string): string[] {
  return [...markdown.matchAll(/^### `([A-Z]+) ([^`]+)`$/gm)]
    .map((match) => `${match[1]} ${match[2]}`)
    .sort();
}

export function compareOperationKeys(
  expected: readonly string[],
  actual: readonly string[],
): { missing: string[]; extra: string[] } {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((operation) => !actualSet.has(operation)),
    extra: actual.filter((operation) => !expectedSet.has(operation)),
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const spec = JSON.parse(
    await readFile(resolve(root, 'docs-json.json'), 'utf8'),
  ) as OpenApiDocument;
  const markdown = await readFile(
    resolve(root, 'docs/api-reference-detailed.md'),
    'utf8',
  );
  const operations = operationKeys(spec);
  const comparison = compareOperationKeys(
    operations,
    markdownOperationKeys(markdown),
  );
  if (comparison.missing.length || comparison.extra.length) {
    throw new Error(
      `Detailed API documentation inventory differs from docs-json.json. Missing: ${comparison.missing.join(', ') || 'none'}; extra: ${comparison.extra.join(', ') || 'none'}`,
    );
  }
  console.log(
    `API contract inventory: ${operations.length} operations; markdown matches.`,
  );
}

if (process.argv[1]?.endsWith('api-contract-check.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
