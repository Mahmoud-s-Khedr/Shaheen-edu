import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ARABIC_SEARCH_TARGETS } from './arabic-search';

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, acc);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) acc.push(path);
  }
  return acc;
}

const SRC = join(__dirname, '..', '..');
const CALL_SITES = sourceFiles(SRC)
  .filter((path) => !path.includes(join('common', 'search')))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('Arabic search targets', () => {
  /**
   * Each target has a GIN expression index behind it, which costs write
   * throughput on every insert and update. An unreferenced target means either
   * a service that quietly stopped using Arabic-aware search, or an index that
   * should be dropped -- both worth failing over.
   */
  it.each(ARABIC_SEARCH_TARGETS)('target %s is used by at least one service', (target) => {
    expect(CALL_SITES).toContain(`'${target}'`);
  });

  it('has no service left doing a raw contains search on a q parameter', () => {
    expect(CALL_SITES).not.toMatch(/contains:\s*(q\.q|query\.q|pagination\.q|search|searchQuery)\b/);
  });
});
