import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type RawQueryClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

/**
 * Minimal structural view of a Prisma model delegate. Deliberately untyped in
 * its row type: Prisma's `findMany` overloads derive the row shape from the
 * `include`/`select` passed at the call site, which cannot be recovered through
 * this indirection. Callers annotate the result themselves where it matters.
 */
type SearchableDelegate = {
  findMany(args: any): Promise<any[]>;
  count(args: any): Promise<number>;
};

const logger = new Logger('ArabicSearch');

/**
 * Hard ceiling on an unpaged id resolution. Every caller of
 * {@link searchArabicIds} scopes the query to a single parent, so the result is
 * bounded by that parent's child count and the cap is unreachable in practice.
 * It exists so a mis-scoped call degrades into a logged, bounded result instead
 * of a multi-megabyte `id IN (...)` list that trips Postgres' 65535 bind
 * parameter limit.
 */
const ID_RESOLUTION_CAP = 10_000;

/**
 * Searchable text per model, kept expression-identical to the GIN indexes in
 * `prisma/migrations/20260808150000_arabic_list_search/migration.sql`.
 *
 * Columns are qualified with the `t` alias the helpers below bind the target
 * table to. Qualification does not defeat the expression indexes: `t.title` and
 * a bare `title` parse to the same Var, so the planner still matches them.
 */
const searchTargets = {
  academicGrade: {
    table: '"AcademicGrade"',
    columns: ['titleAr', 'titleEn', 'slug', 'descriptionAr', 'descriptionEn'],
  },
  subject: { table: '"Subject"', columns: ['title', 'slug', 'description'] },
  course: { table: '"Course"', columns: ['title', 'slug', 'description'] },
  chapter: { table: '"Chapter"', columns: ['title', 'slug', 'description'] },
  lesson: { table: '"Lesson"', columns: ['title', 'slug', 'description'] },
  section: { table: '"Section"', columns: ['title', 'slug', 'description'] },
  contentItem: {
    table: '"ContentItem"',
    columns: ['title', 'description', 'textBody'],
  },
  question: { table: '"Question"', columns: ['body', 'explanation'] },
  questionBank: { table: '"QuestionBank"', columns: ['title', 'description'] },
  questionSource: {
    table: '"QuestionSource"',
    columns: ['titleAr', 'titleEn', 'noteAr', 'noteEn'],
  },
  manualPaymentMethod: {
    table: '"ManualPaymentMethod"',
    columns: ['titleAr', 'titleEn', 'instructionsAr', 'instructionsEn'],
  },
  governorate: { table: '"Governorate"', columns: ['nameAr', 'nameEn'] },
  center: { table: '"Center"', columns: ['nameAr', 'nameEn'] },
  assessment: { table: '"Assessment"', columns: ['title'] },
  user: { table: '"User"', columns: ['loginIdentifier'] },
  studentProfile: { table: '"StudentProfile"', columns: ['fullName'] },
  partnerProfile: {
    table: '"PartnerProfile"',
    columns: ['displayName', 'legalName'],
  },
} as const;

/**
 * Builds the concatenated searchable text for a target, bound to a table alias.
 *
 * Must stay expression-identical to the index definitions in the migration.
 * Quoting a lowercase column (`t."title"` vs the migration's bare `title`) is
 * safe: both parse to the same Var, so the planner still matches the index.
 */
function searchableText(target: ArabicSearchTarget, alias: string): string {
  return searchTargets[target].columns
    .map((column) => `coalesce(${alias}."${column}", '')`)
    .join(` || ' ' || `);
}

export type ArabicSearchTarget = keyof typeof searchTargets;

/** Every target must be reachable from a service; see arabic-search.spec.ts. */
export const ARABIC_SEARCH_TARGETS = Object.keys(
  searchTargets,
) as ArabicSearchTarget[];

/**
 * Narrows the searched table to the rows the caller is already allowed to see.
 *
 * INVARIANT: `where` may only contain conditions that also appear conjunctively
 * in the caller's Prisma `where`, and the caller must re-apply that Prisma
 * `where` when hydrating. A scope that is too wide over-reports `total` and can
 * yield a short page; it can never widen what the endpoint discloses. A scope
 * narrower than the Prisma `where` is forbidden -- it would hide rows the
 * endpoint is supposed to return.
 */
export type ArabicSearchScope = {
  /** AND-ed with the text match. Reference the target table as `t`. */
  where?: Prisma.Sql;
  /** Extra JOIN clauses. Must use an alias other than `t`. */
  join?: Prisma.Sql;
  /** OR-ed with the target's own text match, for hits on a child table. */
  alsoMatches?: Prisma.Sql;
};

/**
 * Keep this algorithm in sync with the `arabic_normalize` PostgreSQL function.
 * It intentionally does not equate taa marbuta and haa: that produces too many
 * false positives in educational content.
 */
export function normalizeArabic(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ی/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Inputs that exercise every branch of the normalizer: diacritics, tatweel,
 * alef/yeh/keheh folding, both Arabic-Indic digit blocks, punctuation-to-space,
 * and NFKC presentation forms. Expected values are computed with the function
 * itself, so the fixture cannot drift from the implementation -- it exists to
 * assert that the SQL twin agrees, not to pin specific output.
 */
export const NORMALIZER_FIXTURES: ReadonlyArray<readonly [string, string]> = [
  '  إِلـى  یَوم ۱۲٣! ',
  'إسلاميات',
  'مُعَلَّم',
  'ﻣﺪﺭﺳﺔ',
  'کتاب ٠١٢',
  'Chapter-12',
].map((input) => [input, normalizeArabic(input)] as const);

/** Resolves the deprecated `search` parameter without silently changing intent. */
export function resolveSearchQuery(input: {
  q?: string;
  search?: string;
}): string | undefined {
  const q = input.q?.trim();
  const legacy = input.search?.trim();
  if (!q && !legacy) return undefined;
  if (q && legacy && normalizeArabic(q) !== normalizeArabic(legacy)) {
    throw new BadRequestException(
      'q and search must contain the same value when both are supplied',
    );
  }
  const result = q ?? legacy!;
  if (!normalizeArabic(result))
    throw new BadRequestException('q must contain searchable text');
  return result;
}

/**
 * Single gate for "does this request carry a search?". Returns undefined when
 * there is nothing to search for, and rejects input that normalizes away
 * entirely (e.g. `!!!`) rather than letting it match every row.
 */
export function searchNeedle(q?: string): string | undefined {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;
  if (!normalizeArabic(trimmed))
    throw new BadRequestException('q must contain searchable text');
  return trimmed;
}

/** Escapes LIKE metacharacters before a value is passed as a bind parameter. */
export function likePattern(query: string): string {
  return `%${normalizeArabic(query).replace(/[\\%_]/g, '\\$&')}%`;
}

/** Splits a query into its normalized, non-empty search terms. */
export function searchTerms(query: string): string[] {
  return normalizeArabic(query).split(' ').filter(Boolean);
}

/** ANDs the defined fragments; returns undefined when none apply. */
export function sqlAnd(
  ...parts: Array<Prisma.Sql | undefined | false>
): Prisma.Sql | undefined {
  const defined = parts.filter((part): part is Prisma.Sql => Boolean(part));
  if (!defined.length) return undefined;
  return defined.length === 1 ? defined[0] : Prisma.join(defined, ' AND ');
}

/** Restores the order the SQL page established, which `IN (...)` does not preserve. */
export function orderByIds<T extends { id: string }>(
  rows: T[],
  ids: string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is T => row !== undefined);
}

/**
 * The LIKE predicate matching `query` against a target's searchable text.
 *
 * Exported so a caller can express a hit on a *related* table (a governorate
 * matching through one of its centers, a user through their profile) without
 * restating the text expression and risking drift from the index.
 */
export function arabicMatchText(
  normalizedText: Prisma.Sql,
  query: string,
): Prisma.Sql {
  const terms = searchTerms(query);
  if (!terms.length) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    terms.map(
      (term) =>
        Prisma.sql`${normalizedText} LIKE ${likePattern(term)} ESCAPE E'\\\\'`,
    ),
    ' AND ',
  )})`;
}

export function arabicMatch(
  target: ArabicSearchTarget,
  query: string,
  alias = 't',
): Prisma.Sql {
  // Four backslashes: the template literal collapses them to two, so Postgres
  // receives E'\\' -- a single literal backslash. Fewer would be unterminated.
  return arabicMatchText(
    Prisma.sql`arabic_normalize(${Prisma.raw(searchableText(target, alias))})`,
    query,
  );
}

function matchPredicate(
  target: ArabicSearchTarget,
  query: string,
  scope?: ArabicSearchScope,
): Prisma.Sql {
  const own = arabicMatch(target, query);
  return scope?.alsoMatches
    ? Prisma.sql`(${own} OR ${scope.alsoMatches})`
    : Prisma.sql`(${own})`;
}

function whereClause(
  target: ArabicSearchTarget,
  query: string,
  scope?: ArabicSearchScope,
): Prisma.Sql {
  const match = matchPredicate(target, query, scope);
  return scope?.where ? Prisma.sql`${match} AND (${scope.where})` : match;
}

/**
 * Resolves the ids matching `query` within `scope`, without paging.
 *
 * Only for callers whose scope bounds the result to one parent's children
 * (cursor-paginated catalog endpoints). Anything listing a whole table must use
 * {@link searchArabicOffsetPage} so Postgres, not the application, does the
 * paging.
 */
export async function searchArabicIds(
  prisma: RawQueryClient,
  target: ArabicSearchTarget,
  query?: string,
  scope?: ArabicSearchScope,
): Promise<string[] | undefined> {
  const needle = searchNeedle(query);
  if (!needle) return undefined;
  const config = searchTargets[target];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t.id FROM ${Prisma.raw(config.table)} t
    ${scope?.join ?? Prisma.empty}
    WHERE ${whereClause(target, needle, scope)}
    LIMIT ${ID_RESOLUTION_CAP + 1}
  `);
  if (rows.length > ID_RESOLUTION_CAP) {
    logger.warn(
      `Search on "${target}" resolved more than ${ID_RESOLUTION_CAP} ids and was truncated; the caller's scope is too wide.`,
    );
    rows.length = ID_RESOLUTION_CAP;
  }
  return rows.map((row) => row.id);
}

/**
 * Resolves one page of ids in the database: the text match, the scope, the
 * ordering and the LIMIT/OFFSET all run in a single statement, so the id list
 * handed back to Prisma is never larger than `limit`.
 */
export async function searchArabicOffsetPage(
  prisma: RawQueryClient,
  target: ArabicSearchTarget,
  query: string,
  options: {
    scope?: ArabicSearchScope;
    orderBy: Prisma.Sql;
    page: number;
    limit: number;
  },
): Promise<{ ids: string[]; total: number }> {
  const config = searchTargets[target];
  const rows = await prisma.$queryRaw<
    Array<{ id: string; total: bigint }>
  >(Prisma.sql`
    SELECT t.id, count(*) OVER () AS total
    FROM ${Prisma.raw(config.table)} t
    ${options.scope?.join ?? Prisma.empty}
    WHERE ${whereClause(target, query, options.scope)}
    ORDER BY ${options.orderBy}
    LIMIT ${options.limit} OFFSET ${(options.page - 1) * options.limit}
  `);
  return {
    ids: rows.map((row) => row.id),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

/**
 * Offset pagination that searches in SQL when `q` is present and falls back to
 * the plain Prisma path when it is not.
 *
 * The caller's `where` is applied in both branches; `scope` only narrows which
 * rows the SQL page considers, per the invariant on {@link ArabicSearchScope}.
 */
export async function paginateArabicSearch<T = any>(options: {
  prisma: RawQueryClient;
  delegate: SearchableDelegate;
  target: ArabicSearchTarget;
  q?: string;
  scope?: ArabicSearchScope;
  /** SQL ordering for the search branch; must express the same intent as `orderBy`. */
  orderBySql: Prisma.Sql;
  /** Prisma ordering for the unsearched branch. */
  orderBy: unknown;
  where: Record<string, unknown>;
  /** `include`/`select` passed through to findMany. */
  args?: Record<string, unknown>;
  page: number;
  limit: number;
}): Promise<{ data: T[]; total: number }> {
  const needle = searchNeedle(options.q);
  if (!needle) {
    const [data, total] = await Promise.all([
      options.delegate.findMany({
        ...options.args,
        where: options.where,
        orderBy: options.orderBy,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      options.delegate.count({ where: options.where }),
    ]);
    return { data, total };
  }

  const page = await searchArabicOffsetPage(
    options.prisma,
    options.target,
    needle,
    {
      scope: options.scope,
      orderBy: options.orderBySql,
      page: options.page,
      limit: options.limit,
    },
  );
  if (!page.ids.length) return { data: [], total: page.total };

  const data = await options.delegate.findMany({
    ...options.args,
    where: { ...options.where, id: { in: page.ids } },
  });
  return {
    data: orderByIds(data as Array<{ id: string }>, page.ids) as T[],
    total: page.total,
  };
}
