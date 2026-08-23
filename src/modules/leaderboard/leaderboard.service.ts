import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  AssessmentAttemptStatus,
  AssessmentQuestionOutcome,
  Role,
} from '../../common/types/roles.enum';
import {
  PaginationQueryDto,
  toPaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';

type Week = { key: string; startsAt: Date; endsAt: Date };
const CAIRO_TIME_ZONE = 'Africa/Cairo';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  weekFor(now = new Date()): Week {
    const local = DateTime.fromJSDate(now, { zone: CAIRO_TIME_ZONE });
    const daysSinceFriday = (local.weekday - 5 + 7) % 7;
    const startDate = DateTime.fromISO(local.toISODate()!)
      .minus({ days: daysSinceFriday })
      .toISODate()!;
    const endDate = DateTime.fromISO(startDate).plus({ weeks: 1 }).toISODate()!;
    const startsAt = DateTime.fromISO(startDate, {
      zone: CAIRO_TIME_ZONE,
    }).startOf('day');
    const endsAt = DateTime.fromISO(endDate, {
      zone: CAIRO_TIME_ZONE,
    }).startOf('day');
    return {
      key: startDate,
      startsAt: startsAt.toUTC().toJSDate(),
      endsAt: endsAt.toUTC().toJSDate(),
    };
  }

  private displayName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0]} ${parts.at(-1)![0]}.`
      : (parts[0] ?? 'Student');
  }

  private async rows(
    week: Week,
    db: Pick<Prisma.TransactionClient, 'assessmentAttempt'> = this.prisma,
  ) {
    const attempts = await db.assessmentAttempt.findMany({
      where: {
        status: AssessmentAttemptStatus.COMPLETED,
        submittedAt: { gte: week.startsAt, lt: week.endsAt },
        student: {
          user: { role: Role.STUDENT, deletedAt: null, status: 'ACTIVE' },
        },
        // A score that is still awaiting a human or AI grade cannot fairly be
        // ranked. It becomes eligible once every answer has a final outcome.
        answers: {
          none: {
            outcome: {
              in: [
                AssessmentQuestionOutcome.PENDING_GRADING,
                AssessmentQuestionOutcome.PENDING_AI_GRADING,
              ],
            },
          },
        },
      },
      include: {
        student: {
          select: { userId: true, fullName: true, academicGradeId: true },
        },
        answers: { select: { outcome: true } },
      },
    });
    const byStudent = new Map<string, any>();
    for (const attempt of attempts) {
      const row = byStudent.get(attempt.studentUserId) ?? {
        studentUserId: attempt.studentUserId,
        academicGradeId: attempt.student.academicGradeId,
        displayName: this.displayName(attempt.student.fullName),
        quizzesCompleted: 0,
        totalQuestions: 0,
        answeredQuestions: 0,
        correctAnswers: 0,
      };
      row.quizzesCompleted++;
      row.totalQuestions += attempt.totalQuestions;
      for (const answer of attempt.answers) {
        if (
          (
            [
              AssessmentQuestionOutcome.CORRECT,
              AssessmentQuestionOutcome.PARTIALLY_CORRECT,
              AssessmentQuestionOutcome.INCORRECT,
            ] as AssessmentQuestionOutcome[]
          ).includes(answer.outcome as AssessmentQuestionOutcome)
        )
          row.answeredQuestions++;
        if (answer.outcome === AssessmentQuestionOutcome.CORRECT)
          row.correctAnswers++;
      }
      byStudent.set(attempt.studentUserId, row);
    }
    return [...byStudent.values()]
      .map((row) => {
        const rawAccuracyPercent = row.answeredQuestions
          ? (row.correctAnswers / row.answeredQuestions) * 100
          : 0;
        return {
          ...row,
          // The source document's percentage-based accuracy component is not
          // rounded before ranking.
          smartScore: rawAccuracyPercent * 0.6 + row.totalQuestions * 0.4,
          rawAccuracyPercent,
          accuracyPercent: Math.round(rawAccuracyPercent * 10) / 10,
        };
      })
      .sort(
        (a, b) =>
          b.smartScore - a.smartScore ||
          b.rawAccuracyPercent - a.rawAccuracyPercent ||
          b.correctAnswers - a.correctAnswers ||
          b.totalQuestions - a.totalQuestions ||
          a.studentUserId.localeCompare(b.studentUserId),
      )
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  private entryDto(entry: any) {
    const medals: Record<number, { tier: string; label: string }> = {
      1: { tier: 'GOLD', label: 'Gold Medal' },
      2: { tier: 'SILVER', label: 'Silver Medal' },
      3: { tier: 'BRONZE', label: 'Bronze Medal' },
    };
    return {
      rank: entry.rank,
      student: { displayName: entry.displayName },
      quizzesCompleted: entry.quizzesCompleted,
      totalQuestions: entry.totalQuestions,
      answeredQuestions: entry.answeredQuestions,
      correctAnswers: entry.correctAnswers,
      accuracyPercent: entry.accuracyPercent,
      smartScore: entry.smartScore,
      award: entry.award
        ? { tier: entry.award.tier, label: entry.award.label }
        : (medals[entry.rank] ?? null),
    };
  }

  async current(studentId: string, query: PaginationQueryDto) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { userId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const week = this.weekFor();
    // A request after a missed scheduler run safely materializes the prior week.
    await this.finalize(this.weekFor(new Date(week.startsAt.getTime() - 1)));
    const rows = await this.rows(week);
    const mine = rows.find((row) => row.studentUserId === studentId) ?? null;
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    return {
      week: {
        key: week.key,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
      },
      honorBoard: rows.slice(0, 5).map(this.entryDto),
      data: rows.slice((page - 1) * limit, page * limit).map(this.entryDto),
      myRank: mine ? this.entryDto(mine) : null,
      meta: toPaginationMeta(page, limit, rows.length),
    };
  }

  async history(studentId: string, weekKey: string, query: PaginationQueryDto) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { userId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const week = await this.prisma.leaderboardWeek.findUnique({
      where: { weekKey },
      include: {
        entries: {
          include: { award: true },
          orderBy: { rank: 'asc' },
        },
      },
    });
    if (!week?.finalizedAt)
      throw new NotFoundException('Leaderboard week not found');
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    const entries = week.entries;
    const mine =
      entries.find((entry) => entry.studentUserId === studentId) ?? null;
    return {
      week: {
        key: week.weekKey,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
        finalizedAt: week.finalizedAt,
      },
      honorBoard: entries.slice(0, 5).map((entry) => this.entryDto(entry)),
      data: entries
        .slice((page - 1) * limit, page * limit)
        .map((entry) => this.entryDto(entry)),
      myRank: mine ? this.entryDto(mine) : null,
      meta: toPaginationMeta(page, limit, entries.length),
    };
  }

  async finalize(week: Week) {
    const persisted = await this.prisma.leaderboardWeek.upsert({
      where: { weekKey: week.key },
      create: {
        weekKey: week.key,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
      },
      update: {},
    });
    if (persisted.finalizedAt) return;
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ finalizedAt: Date | null }>>(
        Prisma.sql`
          SELECT "finalizedAt"
          FROM "LeaderboardWeek"
          WHERE id = ${persisted.id}
          FOR UPDATE
        `,
      );
      if (locked[0]?.finalizedAt) return;
      for (const row of await this.rows(week, tx)) {
        const { rawAccuracyPercent: _rawAccuracyPercent, ...entryData } = row;
        const entry = await tx.leaderboardEntry.create({
          data: { weekId: persisted.id, ...entryData },
        });
        const awards: Record<number, [string, string]> = {
          1: ['GOLD', 'Gold Medal'],
          2: ['SILVER', 'Silver Medal'],
          3: ['BRONZE', 'Bronze Medal'],
        };
        if (awards[row.rank])
          await tx.leaderboardAward.create({
            data: {
              entryId: entry.id,
              tier: awards[row.rank][0],
              label: awards[row.rank][1],
            },
          });
      }
      await tx.leaderboardWeek.update({
        where: { id: persisted.id },
        data: { finalizedAt: new Date() },
      });
    });
  }

  @Cron('0 0 * * 5', { timeZone: 'Africa/Cairo' }) async weeklyFinalization() {
    const current = this.weekFor();
    const end = new Date(current.startsAt.getTime() - 1);
    await this.finalize(this.weekFor(end));
  }
}
