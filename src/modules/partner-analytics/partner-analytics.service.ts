import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  PartnerType,
  PublisherUsageScope,
  PublisherAgreementStatus,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import type { AppConfig } from '../../config/configuration';
import type {
  PartnerContentQueryDto,
  PartnerAllocationsQueryDto,
  PartnerEarningsQueryDto,
  PartnerPeriodQueryDto,
  PartnerQuestionUsageQueryDto,
} from './dto/partner-analytics.dto';
import { LedgerPublisherEarningsService } from './ledger-publisher-earnings.service';

const CAIRO = 'Africa/Cairo';
const EGP = 'EGP';
type Period = { from: Date; to: Date; fromDate: string; toDate: string };
type Agreement = {
  id: string;
  courseId: string | null;
  chapterId: string | null;
  lessonId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  status: PublisherAgreementStatus;
};

@Injectable()
export class PartnerAnalyticsService {
  private readonly partnerLedgerEnabled: boolean;
  private readonly partnerLedgerAllowedUserIds: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerPublisherEarningsService,
    config?: ConfigService<AppConfig, true>,
  ) {
    const features = config?.get('features', { infer: true }) ?? {
      // Focused service tests instantiate this class without application
      // configuration. The running application always supplies configuration,
      // whose default for this rollout control is off.
      partnerLedgerEnabled: true,
      partnerLedgerAllowedUserIds: [],
    };
    this.partnerLedgerEnabled = features.partnerLedgerEnabled;
    this.partnerLedgerAllowedUserIds = features.partnerLedgerAllowedUserIds;
  }

  private assertPartnerLedgerAccess(userId: string) {
    const allowlist = this.partnerLedgerAllowedUserIds;
    if (
      !this.partnerLedgerEnabled ||
      (allowlist.length > 0 &&
        !allowlist.includes('*') &&
        !allowlist.includes(userId))
    ) {
      throw new ConflictException(
        'Partner ledger reporting is disabled by rollout control',
      );
    }
  }

  private money(amountMinor = 0) {
    return { amountMinor, currency: EGP };
  }

  private async publisher(userId: string) {
    const profile = await this.prisma.partnerProfile.findUnique({
      where: { userId },
      select: { partnerType: true },
    });
    if (!profile || profile.partnerType !== PartnerType.CONTENT_PUBLISHER) {
      throw new ForbiddenException(
        'Content publisher reporting is not available for this partner',
      );
    }
    this.assertPartnerLedgerAccess(userId);
  }
  private async partner(userId: string) {
    const profile = await this.prisma.partnerProfile.findUnique({
      where: { userId },
      select: { userId: true },
    });
    if (!profile)
      throw new ForbiddenException(
        'Partner reporting is not available for this account',
      );
    this.assertPartnerLedgerAccess(userId);
  }

  private period(query: PartnerPeriodQueryDto): Period {
    const now = DateTime.now().setZone(CAIRO);
    const fromDate = query.from ?? now.startOf('month').toISODate()!;
    const toDate = query.to ?? now.endOf('month').toISODate()!;
    const from = DateTime.fromISO(fromDate, { zone: CAIRO }).startOf('day');
    const to = DateTime.fromISO(toDate, { zone: CAIRO })
      .plus({ days: 1 })
      .startOf('day');
    if (!from.isValid || !to.isValid || to <= from) {
      throw new BadRequestException('from must be on or before to');
    }
    return {
      from: from.toUTC().toJSDate(),
      to: to.toUTC().toJSDate(),
      fromDate,
      toDate,
    };
  }

  private isCurrent(agreement: Agreement, at = new Date()) {
    return (
      agreement.status === PublisherAgreementStatus.ACTIVE &&
      agreement.startsAt <= at &&
      (!agreement.endsAt || agreement.endsAt > at)
    );
  }

  async dashboard(userId: string, query: PartnerPeriodQueryDto) {
    await this.publisher(userId);
    const period = this.period(query);
    return this.ledger.report(userId, period, 'day');
  }

  async earnings(userId: string, query: PartnerEarningsQueryDto) {
    await this.publisher(userId);
    const period = this.period(query);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    const granularity = query.granularity ?? (days <= 93 ? 'day' : 'month');
    return this.ledger.report(userId, period, granularity);
  }

  async allocations(userId: string, query: PartnerAllocationsQueryDto) {
    await this.partner(userId);
    const period = this.period(query);
    const { page, limit } = query;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerAllocation.findMany({
        where: {
          partnerUserId: userId,
          createdAt: { gte: period.from, lt: period.to },
        },
        select: {
          id: true,
          kind: true,
          state: true,
          basisMinor: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          paidAt: true,
          reversedAt: true,
          publisherAgreementId: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.partnerAllocation.count({
        where: {
          partnerUserId: userId,
          createdAt: { gte: period.from, lt: period.to },
        },
      }),
    ]);
    return {
      data: data.map((row) => ({
        ...row,
        basis: this.money(row.basisMinor),
        amount: this.money(row.amountMinor),
      })),
      meta: toPaginationMeta(page, limit, total),
    };
  }

  private async usage(userId: string, query: PartnerQuestionUsageQueryDto) {
    await this.publisher(userId);
    const period = this.period(query);
    if (
      DateTime.fromJSDate(period.to).diff(
        DateTime.fromJSDate(period.from),
        'days',
      ).days > 93
    )
      throw new BadRequestException(
        'Question-usage ranges are limited to 93 days',
      );
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { startedAt: { gte: period.from, lt: period.to } },
      select: {
        studentUserId: true,
        startedAt: true,
        assessment: {
          select: {
            questions: {
              select: {
                id: true,
                sourceQuestionId: true,
                body: true,
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
                    publisherUserId: userId,
                    ...(query.sourceId ? { sourceId: query.sourceId } : {}),
                  },
                  select: { sourceId: true, sourceTitle: true },
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
          },
        },
      },
    });
    const sources = new Map<string, any>();
    const questions = new Map<string, any>();
    const occurrences = new Map<
      string,
      Array<{ startedAt: Date; sourceId: string; trendKey: string }>
    >();
    const trends = new Map<string, any>();
    const source = (id: string, title: string | null) =>
      sources.get(id) ?? {
        sourceId: id,
        sourceTitle: title,
        presented: 0,
        solved: 0,
        correct: 0,
        graded: 0,
        unique: new Set<string>(),
        reattempts: 0,
      };
    for (const attempt of attempts) {
      const trendKey =
        (query.granularity ?? 'day') === 'month'
          ? DateTime.fromJSDate(attempt.startedAt)
              .setZone(CAIRO)
              .toFormat('yyyy-LL')
          : DateTime.fromJSDate(attempt.startedAt).setZone(CAIRO).toISODate()!;
      const trend = trends.get(trendKey) ?? {
        period: trendKey,
        presented: 0,
        solved: 0,
        correct: 0,
        graded: 0,
        unique: new Set<string>(),
        reattempts: 0,
      };
      trends.set(trendKey, trend);
      const answers = new Map(
        attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]),
      );
      for (const question of attempt.assessment.questions)
        for (const attribution of question.attributions) {
          if (!this.matchesHierarchy(question.placements, query)) continue;
          const sourceId = attribution.sourceId ?? 'unknown';
          const row = source(sourceId, attribution.sourceTitle);
          row.presented += 1;
          trend.presented += 1;
          sources.set(sourceId, row);
          const questionKey = `${sourceId}:${question.sourceQuestionId}`;
          const questionRow = questions.get(questionKey) ?? {
            sourceId,
            sourceTitle: attribution.sourceTitle,
            sourceQuestionId: question.sourceQuestionId,
            presented: 0,
            solved: 0,
            correct: 0,
            graded: 0,
            unique: new Set<string>(),
            reattempts: 0,
          };
          questionRow.presented += 1;
          questions.set(questionKey, questionRow);
          const answer = answers.get(question.id);
          if (!answer) continue;
          row.solved += 1;
          row.unique.add(attempt.studentUserId);
          questionRow.solved += 1;
          questionRow.unique.add(attempt.studentUserId);
          trend.solved += 1;
          trend.unique.add(attempt.studentUserId);
          if (answer.isCorrect !== null) {
            row.graded += 1;
            questionRow.graded += 1;
            trend.graded += 1;
            if (answer.isCorrect) {
              row.correct += 1;
              questionRow.correct += 1;
              trend.correct += 1;
            }
          }
          const occurrenceKey = `${attempt.studentUserId}:${questionKey}`;
          const list = occurrences.get(occurrenceKey) ?? [];
          list.push({ startedAt: attempt.startedAt, sourceId, trendKey });
          occurrences.set(occurrenceKey, list);
        }
    }
    for (const list of occurrences.values())
      if (list.length > 1) {
        list.sort((a, b) => a.startedAt.valueOf() - b.startedAt.valueOf());
        const sourceRow = sources.get(list[0].sourceId);
        if (sourceRow) sourceRow.reattempts += list.length - 1;
        for (const item of list.slice(1)) {
          const trend = trends.get(item.trendKey);
          if (trend) trend.reattempts += 1;
        }
      }
    const available = await this.prisma.question.count({
      where: {
        source: { publisherUserId: userId, status: 'PUBLISHED' },
        status: 'PUBLISHED',
        ...(query.sourceId ? { sourceId: query.sourceId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
      },
    });
    const normalize = (row: any) => ({
      ...row,
      uniqueSolvers: row.unique.size,
      usageRate: {
        numerator: row.solved,
        denominator: row.presented,
        value: row.presented ? row.solved / row.presented : 0,
      },
      correctRate: {
        numerator: row.correct,
        denominator: row.graded,
        value: row.graded ? row.correct / row.graded : null,
      },
    });
    const sourceRows = [...sources.values()].map(normalize);
    const questionRows = [...questions.values()].map(normalize);
    return {
      period,
      available,
      sourceRows,
      questionRows,
      trend: [...trends.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(normalize),
      totals: normalize(
        sourceRows.reduce(
          (total: any, row: any) => ({
            sourceId: 'all',
            sourceTitle: null,
            presented: total.presented + row.presented,
            solved: total.solved + row.solved,
            correct: total.correct + row.correct,
            graded: total.graded + row.graded,
            unique: new Set([...total.unique, ...row.unique]),
            reattempts: total.reattempts + row.reattempts,
          }),
          {
            sourceId: 'all',
            sourceTitle: null,
            presented: 0,
            solved: 0,
            correct: 0,
            graded: 0,
            unique: new Set<string>(),
            reattempts: 0,
          },
        ),
      ),
    };
  }
  private usageScope(query: PartnerQuestionUsageQueryDto) {
    const configured = [
      ['sectionId', 'SECTION'],
      ['lessonId', 'LESSON'],
      ['chapterId', 'CHAPTER'],
      ['courseId', 'COURSE'],
      ['subjectId', 'SUBJECT'],
    ] as const;
    const selected = configured.find(([field]) => query[field]);
    return selected
      ? {
          scope: PublisherUsageScope[selected[1]],
          scopeKey: `${selected[1]}:${query[selected[0]]}`,
        }
      : { scope: PublisherUsageScope.ALL, scopeKey: 'ALL' };
  }

  private matchesHierarchy(
    placements: Array<{
      subjectId: string;
      courseId: string;
      chapterId: string | null;
      lessonId: string | null;
      sectionId: string | null;
    }>,
    query: PartnerQuestionUsageQueryDto,
  ) {
    const filters = {
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.lessonId ? { lessonId: query.lessonId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };
    if (!Object.keys(filters).length) return true;
    return placements.some((placement) =>
      Object.entries(filters).every(
        ([field, value]) =>
          placement[field as keyof typeof placement] === value,
      ),
    );
  }

  private usageMetrics(input: {
    presented: number;
    solved: number;
    correct: number;
    graded: number;
    reattempts: number;
    uniqueSolvers: number;
  }) {
    return {
      ...input,
      usageRate: {
        numerator: input.solved,
        denominator: input.presented,
        value: input.presented ? input.solved / input.presented : 0,
      },
      correctRate: {
        numerator: input.correct,
        denominator: input.graded,
        value: input.graded ? input.correct / input.graded : null,
      },
    };
  }

  private rollupDates(period: Period) {
    return {
      gte: new Date(`${period.fromDate}T00:00:00.000Z`),
      lte: new Date(`${period.toDate}T00:00:00.000Z`),
    };
  }

  private async rolledUpUsage(
    userId: string,
    query: PartnerQuestionUsageQueryDto,
  ) {
    await this.publisher(userId);
    const period = this.period(query);
    const scope = this.usageScope(query);
    const where = {
      publisherUserId: userId,
      usageDate: this.rollupDates(period),
      scope: scope.scope,
      scopeKey: scope.scopeKey,
      ...(query.sourceId ? { sourceKey: query.sourceId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.lessonId ? { lessonId: query.lessonId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };
    const solverWhere = {
      publisherUserId: userId,
      usageDate: this.rollupDates(period),
      scopeKey: scope.scopeKey,
      ...(query.sourceId ? { sourceKey: query.sourceId } : {}),
    };
    const [rows, solverRows, available] = await Promise.all([
      this.prisma.publisherUsageDailyRollup.findMany({
        where,
        select: {
          usageDate: true,
          sourceKey: true,
          sourceTitle: true,
          presented: true,
          solved: true,
          correct: true,
          graded: true,
          reattempts: true,
          calculatedAt: true,
        },
      }),
      this.prisma.publisherUsageDailySolver.findMany({
        where: solverWhere,
        select: { usageDate: true, sourceKey: true, studentFingerprint: true },
      }),
      this.prisma.question.count({
        where: {
          source: { publisherUserId: userId, status: 'PUBLISHED' },
          status: 'PUBLISHED',
          ...(query.sourceId ? { sourceId: query.sourceId } : {}),
          ...(query.courseId ? { courseId: query.courseId } : {}),
        },
      }),
    ]);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    const granularity = query.granularity ?? (days <= 93 ? 'day' : 'month');
    const label = (date: Date) => {
      const cairo = DateTime.fromJSDate(date).setZone(CAIRO);
      return granularity === 'day'
        ? cairo.toISODate()!
        : cairo.toFormat('yyyy-LL');
    };
    const trend = new Map<string, any>();
    const sources = new Map<string, any>();
    for (const row of rows) {
      const target = trend.get(label(row.usageDate)) ?? {
        period: label(row.usageDate),
        presented: 0,
        solved: 0,
        correct: 0,
        graded: 0,
        reattempts: 0,
        unique: new Set<string>(),
      };
      target.presented += row.presented;
      target.solved += row.solved;
      target.correct += row.correct;
      target.graded += row.graded;
      target.reattempts += row.reattempts;
      trend.set(target.period, target);
      const source = sources.get(row.sourceKey) ?? {
        sourceId: row.sourceKey,
        sourceTitle: row.sourceTitle,
        presented: 0,
        solved: 0,
        correct: 0,
        graded: 0,
        reattempts: 0,
        unique: new Set<string>(),
      };
      source.presented += row.presented;
      source.solved += row.solved;
      source.correct += row.correct;
      source.graded += row.graded;
      source.reattempts += row.reattempts;
      sources.set(row.sourceKey, source);
    }
    const allSolvers = new Set<string>();
    for (const solver of solverRows) {
      allSolvers.add(solver.studentFingerprint);
      const periodLabel = label(solver.usageDate);
      trend.get(periodLabel)?.unique.add(solver.studentFingerprint);
      sources.get(solver.sourceKey)?.unique.add(solver.studentFingerprint);
    }
    const summed = rows.reduce(
      (total, row) => ({
        presented: total.presented + row.presented,
        solved: total.solved + row.solved,
        correct: total.correct + row.correct,
        graded: total.graded + row.graded,
        reattempts: total.reattempts + row.reattempts,
      }),
      { presented: 0, solved: 0, correct: 0, graded: 0, reattempts: 0 },
    );
    const totals = this.usageMetrics({
      ...summed,
      uniqueSolvers: allSolvers.size,
    });
    return {
      period,
      available,
      totals,
      sourceRows: [...sources.values()].map((row) =>
        this.usageMetrics({ ...row, uniqueSolvers: row.unique.size }),
      ),
      questionRows: [],
      trend: [...trend.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((row) =>
          this.usageMetrics({ ...row, uniqueSolvers: row.unique.size }),
        ),
      freshness: rows.reduce<Date | null>(
        (latest, row) =>
          !latest || row.calculatedAt > latest ? row.calculatedAt : latest,
        null,
      ),
      rolledUp: true,
    };
  }

  async questionUsage(userId: string, query: PartnerQuestionUsageQueryDto) {
    const period = this.period(query);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    const hasHierarchy = Boolean(
      query.subjectId ||
      query.courseId ||
      query.chapterId ||
      query.lessonId ||
      query.sectionId,
    );
    const usage: any =
      days > 93 || hasHierarchy
        ? await this.rolledUpUsage(userId, query)
        : await this.usage(userId, query);
    const earnings = await this.ledger.report(
      userId,
      period,
      days <= 93 ? 'day' : 'month',
    );
    return {
      period: {
        from: usage.period.fromDate,
        to: usage.period.toDate,
        timeZone: CAIRO,
      },
      availableQuestions: usage.available,
      ...usage.totals,
      trend: usage.trend ?? [],
      rolledUp: usage.rolledUp ?? false,
      freshness: usage.freshness ?? null,
      indicators: {
        zeroUsage: usage.totals.presented === 0,
        zeroSolved: usage.totals.solved === 0,
        earningsDespiteZeroSolved:
          usage.totals.solved === 0 && earnings.totals.net.amountMinor > 0,
        earningsScope: 'ALL_PUBLISHER_LEDGER',
      },
      metricDefinitions: {
        presented:
          'Frozen publisher-attributed assessment questions in started attempts.',
        solved: 'Presented questions with a submitted answer.',
        uniqueSolvers: 'Distinct students with at least one submitted answer.',
        correctRate: 'Correct final answers divided by graded answers.',
        usageRate: 'Solved questions divided by presented questions.',
      },
    };
  }
  async questionUsageSources(
    userId: string,
    query: PartnerQuestionUsageQueryDto,
  ) {
    const period = this.period(query);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    const hasHierarchy = Boolean(
      query.subjectId ||
      query.courseId ||
      query.chapterId ||
      query.lessonId ||
      query.sectionId,
    );
    const usage =
      days > 93 || hasHierarchy
        ? await this.rolledUpUsage(userId, query)
        : await this.usage(userId, query);
    const data = usage.sourceRows.sort(
      (a, b) => b.solved - a.solved || a.sourceId.localeCompare(b.sourceId),
    );
    return {
      data: data.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      meta: toPaginationMeta(query.page, query.limit, data.length),
    };
  }
  async questionUsageQuestions(
    userId: string,
    query: PartnerQuestionUsageQueryDto,
  ) {
    const period = this.period(query);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    if (days > 93)
      throw new BadRequestException(
        'Question drill-down ranges are limited to 93 days; use aggregate usage trends for longer ranges',
      );
    const usage = await this.usage(userId, query);
    const data = usage.questionRows.sort(
      (a, b) =>
        b.solved - a.solved ||
        a.sourceQuestionId.localeCompare(b.sourceQuestionId),
    );
    return {
      data: data.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      meta: toPaginationMeta(query.page, query.limit, data.length),
    };
  }

  async content(userId: string, query: PartnerContentQueryDto) {
    await this.publisher(userId);
    const where = {
      publisherUserId: userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const include = {
      course: { select: { title: true, subject: { select: { title: true } } } },
      chapter: {
        select: {
          title: true,
          course: {
            select: { title: true, subject: { select: { title: true } } },
          },
        },
      },
      lesson: {
        select: {
          title: true,
          chapter: {
            select: {
              title: true,
              course: {
                select: { title: true, subject: { select: { title: true } } },
              },
            },
          },
        },
      },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.publisherAgreement.findMany({
        where,
        include,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publisherAgreement.count({ where }),
    ]);
    return {
      data: data.map((item) => ({
        id: item.id,
        status: item.status,
        revenueShareBps: item.revenueShareBps ?? 0,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        isCurrentlyActive: this.isCurrent(item),
        target: item.course
          ? {
              type: 'COURSE',
              id: item.courseId,
              title: item.course.title,
              subjectName: item.course.subject.title,
            }
          : item.chapter
            ? {
                type: 'CHAPTER',
                id: item.chapterId,
                title: item.chapter.title,
                courseName: item.chapter.course.title,
                subjectName: item.chapter.course.subject.title,
              }
            : {
                type: 'LESSON',
                id: item.lessonId,
                title: item.lesson!.title,
                chapterName: item.lesson!.chapter.title,
                courseName: item.lesson!.chapter.course.title,
                subjectName: item.lesson!.chapter.course.subject.title,
              },
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
}
