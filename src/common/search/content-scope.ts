import { Prisma } from '@prisma/client';
import type { ContentStatus } from '../types/roles.enum';

/**
 * SQL mirror of the status filter every content list applies in Prisma:
 * `status: query.status ?? { not: ARCHIVED }`.
 *
 * Search scopes must mirror the caller's Prisma `where`, never narrow it -- see
 * the invariant on ArabicSearchScope.
 */
export function contentStatusScope(status?: ContentStatus): Prisma.Sql {
  return status
    ? Prisma.sql`t.status = ${status}::"ContentStatus"`
    : Prisma.sql`t.status <> 'ARCHIVED'::"ContentStatus"`;
}

/** SQL mirror of the published-only filter used by the public/student catalog. */
export const publishedScope = Prisma.sql`t.status = 'PUBLISHED'::"ContentStatus"`;

/** SQL mirror of the `[{ sortOrder: 'asc' }, { id: 'asc' }]` catalog ordering. */
export const sortOrderSql = Prisma.sql`t."sortOrder" ASC, t.id ASC`;
