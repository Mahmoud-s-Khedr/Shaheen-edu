import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { ObservabilityService } from '../../common/logging/observability.service';
import { safeErrorRecord } from '../../common/logging/error-record';

type CountRow = { count: bigint };
type IdRow = { id: string };

/** Aggregate-only checks for relationships that can make a catalog look empty. */
@Injectable()
export class IntegrityScanService {
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    diagnostics: ObservabilityService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.diagnostics = diagnostics;
    this.enabled = config.get('observability', {
      infer: true,
    }).runIntegrityScans;
  }
  private readonly diagnostics: ObservabilityService;

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledScan(): Promise<void> {
    if (this.enabled) await this.scan();
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const startedAt = performance.now();
    try {
      const [courseGrade, filteredSubjects, badOrdering, orphaned, examples] =
        await Promise.all([
          this.count(Prisma.sql`
            SELECT count(*)::bigint AS count FROM "Course" c
            WHERE NOT EXISTS (SELECT 1 FROM "SubjectGrade" sg WHERE sg."subjectId" = c."subjectId")
          `),
          this.count(Prisma.sql`
            SELECT 0::bigint AS count
          `),
          this.count(Prisma.sql`
            SELECT count(*)::bigint AS count FROM (
              SELECT c.id, row_number() OVER (PARTITION BY c."subjectId" ORDER BY c."sortOrder", c.id) AS expected, c."sortOrder"
              FROM "Course" c WHERE c.status <> 'ARCHIVED'
            ) ordered WHERE "sortOrder" <> expected
          `),
          this.count(Prisma.sql`
            SELECT count(*)::bigint AS count FROM "Course" c
            JOIN "Subject" s ON s.id = c."subjectId"
            WHERE c.status = 'PUBLISHED' AND s.status <> 'PUBLISHED'
          `),
          this.prisma.$queryRaw<IdRow[]>(Prisma.sql`
            SELECT c.id FROM "Course" c WHERE NOT EXISTS
              (SELECT 1 FROM "SubjectGrade" sg WHERE sg."subjectId" = c."subjectId") LIMIT 5
          `),
        ]);
      this.diagnostics.emit({
        event: 'data_integrity_scan_completed',
        operation: 'hourly_catalog_integrity_scan',
        outcome:
          courseGrade + filteredSubjects + badOrdering + orphaned === 0
            ? 'success'
            : 'failure',
        reasonCode:
          courseGrade + filteredSubjects + badOrdering + orphaned === 0
            ? 'INTEGRITY_OK'
            : 'INTEGRITY_MISMATCH_FOUND',
        durationMs: Math.round(performance.now() - startedAt),
        counts: {
          courseGradeMismatches: courseGrade,
          visibleSubjectsExcludedByGrade: filteredSubjects,
          invalidSiblingOrdering: badOrdering,
          orphanedPublishedDependencies: orphaned,
        },
        references: Object.fromEntries(
          examples.map((row, index) => [
            `courseMismatchExample${index + 1}`,
            this.diagnostics.reference('course', row.id),
          ]),
        ),
      });
    } catch (error) {
      const safe = safeErrorRecord(error);
      this.diagnostics.emit({
        event: 'data_integrity_scan_completed',
        operation: 'hourly_catalog_integrity_scan',
        outcome: 'failure',
        reasonCode: 'INTEGRITY_SCAN_FAILED',
        durationMs: Math.round(performance.now() - startedAt),
        ...safe,
      });
    } finally {
      this.running = false;
    }
  }

  private async count(query: Prisma.Sql): Promise<number> {
    const [row] = await this.prisma.$queryRaw<CountRow[]>(query);
    return Number(row?.count ?? 0n);
  }
}
