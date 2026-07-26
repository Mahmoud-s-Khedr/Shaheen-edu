import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { operationKeys } from '../api-contract-check.js';

export type RequiredCheck =
  | 'happy-path'
  | 'unauthenticated'
  | 'validation'
  | 'not-found'
  | 'state-transition';

export interface OperationManifestEntry {
  key: string;
  requiredChecks: RequiredCheck[];
}

/**
 * The manifest deliberately has one entry for every OpenAPI operation. Rules
 * are derived from the contract so newly documented routes cannot bypass the
 * local acceptance report.
 */
export async function loadOperationManifest(): Promise<
  OperationManifestEntry[]
> {
  const root = process.cwd();
  const document = JSON.parse(
    await readFile(resolve(root, 'docs-json.json'), 'utf8'),
  ) as {
    paths: Record<
      string,
      Record<string, { security?: unknown[]; requestBody?: unknown }>
    >;
  };
  return operationKeys(document).map((key) => {
    const [method, path] = key.split(' ', 2);
    const operation = document.paths[path][method.toLowerCase()];
    const requiredChecks: RequiredCheck[] = ['happy-path'];
    if (operation.security?.length) requiredChecks.push('unauthenticated');
    if (operation.requestBody) requiredChecks.push('validation');
    if (path.includes('{')) requiredChecks.push('not-found');
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method))
      requiredChecks.push('state-transition');
    return { key, requiredChecks };
  });
}
