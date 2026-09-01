import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NORMALIZER_FIXTURES } from './arabic-search';

/**
 * Asserts that the database's `arabic_normalize()` still agrees with the JS
 * `normalizeArabic()`. The migration runs the same assertion, but only once at
 * deploy time -- this also catches a restored dump, a database provisioned with
 * a C/POSIX LC_CTYPE, or a schema pushed with `prisma db push` (which skips
 * migrations entirely).
 *
 * Divergence is not a degraded mode: every indexed value is computed by the SQL
 * function while every needle is computed by the JS one, so a mismatch means
 * searches silently return wrong or empty results. Fail the boot instead.
 */
@Injectable()
export class ArabicSearchHealthIndicator implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArabicSearchHealthIndicator.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    const mismatches: string[] = [];
    for (const [input, expected] of NORMALIZER_FIXTURES) {
      const [row] = await this.prisma.$queryRaw<Array<{ out: string }>>`
        SELECT arabic_normalize(${input}) AS out
      `;
      if (row?.out !== expected) {
        mismatches.push(
          `${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(row?.out)}`,
        );
      }
    }
    if (mismatches.length) {
      throw new Error(
        `arabic_normalize() in the database disagrees with normalizeArabic() in the application. ` +
          `Arabic search would return wrong results. Check the database LC_CTYPE (must be UTF-8, not C/POSIX) ` +
          `and that migrations have been applied. Mismatches: ${mismatches.join('; ')}`,
      );
    }
    this.logger.log(
      `Arabic search normalizer verified against the database (${NORMALIZER_FIXTURES.length} fixtures)`,
    );
  }
}
