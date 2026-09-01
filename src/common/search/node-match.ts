import { normalizeArabic } from './arabic-search';

const SEARCHABLE_KEYS = [
  'title',
  'slug',
  'description',
  'titleAr',
  'titleEn',
  'descriptionAr',
  'descriptionEn',
] as const;

/**
 * Collects the searchable strings of a node, descending one level into plain
 * objects.
 *
 * Nodes arrive in two shapes: raw Prisma records, which carry `titleAr` and
 * `titleEn`, and presentation DTOs, which carry `title: { ar, en }` and drop
 * the flat keys. Reading only top-level strings silently never matches the
 * latter -- which is why searching an academic grade by name used to return
 * nothing.
 */
export function searchableStrings(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  const out: string[] = [];
  for (const key of SEARCHABLE_KEYS) {
    const value = record[key];
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) {
        if (typeof inner === 'string') out.push(inner);
      }
    }
  }
  return out;
}

/**
 * Arabic-aware substring match over a node's searchable text.
 *
 * In-memory counterpart to the SQL search, used by the two student endpoints
 * whose result set is bounded by one student's entitlements. It normalizes both
 * sides so a learner gets the same matches here as from the SQL-backed
 * endpoints next to them.
 */
export function nodeMatches(node: unknown, q?: string): boolean {
  if (!q) return true;
  const needle = normalizeArabic(q);
  if (!needle) return true;
  return searchableStrings(node).some((value) =>
    normalizeArabic(value).includes(needle),
  );
}
