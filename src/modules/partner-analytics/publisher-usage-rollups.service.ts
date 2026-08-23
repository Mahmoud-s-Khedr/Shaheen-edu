import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../../database/prisma.service';

const CAIRO = 'Africa/Cairo';
const UNKNOWN_SOURCE = 'UNKNOWN_LEGACY';

type Scope = {
  scope: 'ALL' | 'SUBJECT' | 'COURSE' | 'CHAPTER' | 'LESSON' | 'SECTION';
  scopeId: string | null;
  scopeKey: string;
  subjectId: string | null;
  courseId: string | null;
  chapterId: string | null;
  lessonId: string | null;
  sectionId: string | null;
};

type Rollup = Scope & {
  usageDate: Date;
  publisherUserId: string;
  sourceId: string | null;
  sourceKey: string;
  sourceTitle: string | null;
  presented: number;
  solved: number;
  graded: number;
  correct: number;
  reattempts: number;
  inputUpdatedAt: Date;
  solvers: Set<string>;
};

@Injectable()
export class PublisherUsageRollupsService {
  constructor(private readonly prisma: PrismaService) {}

  private cairoDay(value: Date) {
    return DateTime.fromJSDate(value).setZone(CAIRO).startOf('day');
  }

  /** Prisma DATE values are stored at a nominal UTC midnight, never a Cairo
   * midnight converted to the preceding UTC calendar date. */
  private dateValue(day: DateTime) {
    return new Date(`${day.toISODate()}T00:00:00.000Z`);
  }

  private range(from: string, to: string) {
    const first = DateTime.fromISO(from, { zone: CAIRO }).startOf('day');
    const last = DateTime.fromISO(to, { zone: CAIRO }).startOf('day');
    if (!first.isValid || !last.isValid || last < first) {
      throw new Error('Invalid publisher usage rollup date range');
    }
    return {
      from: first.toUTC().toJSDate(),
      to: last.plus({ days: 1 }).toUTC().toJSDate(),
      first,
      last,
    };
  }

  private fingerprint(studentUserId: string) {
    // This value is an internal reporting key only. It is domain-separated
    // from other HMAC uses and is never selected by a partner-facing query.
    return createHmac(
      'sha256',
      process.env.NATIONAL_ID_HMAC_SECRET ?? 'development-rollup-key',
    )
      .update(`publisher-usage-solver:${studentUserId}`)
      .digest('hex');
  }

  private scopes(placements: any[]): Scope[] {
    const all: Scope = {
      scope: 'ALL',
      scopeId: null,
      scopeKey: 'ALL',
      subjectId: null,
      courseId: null,
      chapterId: null,
      lessonId: null,
      sectionId: null,
    };
    const rows = new Map<string, Scope>([[all.scopeKey, all]]);
    for (const placement of placements) {
      const shared = {
        subjectId: placement.subjectId ?? null,
        courseId: placement.courseId ?? null,
        chapterId: placement.chapterId ?? null,
        lessonId: placement.lessonId ?? null,
        sectionId: placement.sectionId ?? null,
      };
      const add = (scope: Scope['scope'], scopeId: string | null) => {
        if (!scopeId) return;
        rows.set(`${scope}:${scopeId}`, {
          scope,
          scopeId,
          scopeKey: `${scope}:${scopeId}`,
          ...shared,
        });
      };
      add('SUBJECT', shared.subjectId);
      add('COURSE', shared.courseId);
      add('CHAPTER', shared.chapterId);
      add('LESSON', shared.lessonId);
      add('SECTION', shared.sectionId);
    }
    return [...rows.values()];
  }

  /** Replaces only the requested derived daily range; raw attribution remains untouched. */
  async rebuild(input: { from: string; to: string; publisherUserId?: string }) {
    const period = this.range(input.from, input.to);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { startedAt: { gte: period.from, lt: period.to } },
      select: {
        id: true,
        studentUserId: true,
        startedAt: true,
        lastActivityAt: true,
        assessment: {
          select: {
            questions: {
              select: {
                id: true,
                sourceQuestionId: true,
                placements: {
                  select: {
                    subjectId: true,
                    courseId: true,
                    chapterId: true,
                    lessonId: true,
                    sectionId: true,
                  },
                },
                attributions: {
                  where: {
                    publisherUserId: input.publisherUserId ?? { not: null },
                  },
                  select: {
                    publisherUserId: true,
                    sourceId: true,
                    sourceTitle: true,
                  },
                },
              },
            },
          },
        },
        answers: {
          select: {
            assessmentQuestionId: true,
            isCorrect: true,
            gradedAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
    const rollups = new Map<string, Rollup>();
    const occurrences = new Set<string>();
    for (const attempt of attempts) {
      const answers = new Map(
        attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]),
      );
      for (const question of attempt.assessment.questions) {
        const answer = answers.get(question.id);
        for (const attribution of question.attributions) {
          if (!attribution.publisherUserId) continue;
          const sourceKey = attribution.sourceId ?? UNKNOWN_SOURCE;
          const wasPreviouslySolved = answer
            ? occurrences.has(
                `${attempt.studentUserId}:${attribution.publisherUserId}:${sourceKey}:${question.sourceQuestionId}`,
              )
            : false;
          if (answer)
            occurrences.add(
              `${attempt.studentUserId}:${attribution.publisherUserId}:${sourceKey}:${question.sourceQuestionId}`,
            );
          for (const scope of this.scopes(question.placements)) {
            const day = this.cairoDay(attempt.startedAt);
            const key = `${day.toISODate()}:${attribution.publisherUserId}:${sourceKey}:${scope.scopeKey}`;
            const row = rollups.get(key) ?? {
              ...scope,
              usageDate: this.dateValue(day),
              publisherUserId: attribution.publisherUserId,
              sourceId: attribution.sourceId,
              sourceKey,
              sourceTitle: attribution.sourceTitle,
              presented: 0,
              solved: 0,
              graded: 0,
              correct: 0,
              reattempts: 0,
              inputUpdatedAt: attempt.lastActivityAt,
              solvers: new Set<string>(),
            };
            row.presented += 1;
            if (answer) {
              row.solved += 1;
              row.solvers.add(this.fingerprint(attempt.studentUserId));
              if (wasPreviouslySolved) row.reattempts += 1;
              if (answer.isCorrect !== null) {
                row.graded += 1;
                if (answer.isCorrect) row.correct += 1;
              }
              if (answer.updatedAt > row.inputUpdatedAt)
                row.inputUpdatedAt = answer.updatedAt;
            }
            rollups.set(key, row);
          }
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const rangeWhere = {
        usageDate: {
          gte: this.dateValue(period.first),
          lte: this.dateValue(period.last),
        },
        ...(input.publisherUserId
          ? { publisherUserId: input.publisherUserId }
          : {}),
      };
      await tx.publisherUsageDailySolver.deleteMany({ where: rangeWhere });
      await tx.publisherUsageDailyRollup.deleteMany({ where: rangeWhere });
      if (rollups.size) {
        await tx.publisherUsageDailyRollup.createMany({
          data: [...rollups.values()].map(({ solvers, ...row }) => ({
            ...row,
            uniqueSolvers: solvers.size,
          })),
        });
        await tx.publisherUsageDailySolver.createMany({
          data: [...rollups.values()].flatMap((row) =>
            [...row.solvers].map((studentFingerprint) => ({
              usageDate: row.usageDate,
              publisherUserId: row.publisherUserId,
              sourceKey: row.sourceKey,
              scopeKey: row.scopeKey,
              studentFingerprint,
            })),
          ),
          skipDuplicates: true,
        });
      }
    });
    return {
      from: input.from,
      to: input.to,
      publisherUserId: input.publisherUserId ?? null,
      rows: rollups.size,
    };
  }

  /** Hourly refresh plus a three-day correction window for late grading. */
  @Cron('17 * * * *', { timeZone: CAIRO })
  async refreshRecent() {
    const today = DateTime.now().setZone(CAIRO).startOf('day');
    return this.rebuild({
      from: today.minus({ days: 2 }).toISODate()!,
      to: today.toISODate()!,
    });
  }
}
