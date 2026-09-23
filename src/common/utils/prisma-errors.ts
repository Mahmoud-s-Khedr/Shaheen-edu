import { Prisma } from '@prisma/client';

/**
 * PostgreSQL may surface a RESTRICT violation as Prisma's unknown-request
 * error rather than P2003. Limit the SQLSTATE fallback to that Prisma error
 * type so arbitrary application errors cannot become client conflicts.
 */
export function isPrismaForeignKeyConstraintError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  )
    return true;

  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /\b(?:23001|23503)\b/.test(error.message)
  );
}
