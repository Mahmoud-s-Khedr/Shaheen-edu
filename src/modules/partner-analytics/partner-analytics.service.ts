import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  PartnerType,
  PublisherAgreementStatus,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
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
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerPublisherEarningsService) {}

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
  }
  private async partner(userId: string) {
    const profile = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: { userId: true } });
    if (!profile) throw new ForbiddenException('Partner reporting is not available for this account');
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
        where: { partnerUserId: userId, createdAt: { gte: period.from, lt: period.to } },
        select: { id: true, kind: true, state: true, basisMinor: true, amountMinor: true, currency: true, createdAt: true, paidAt: true, reversedAt: true, publisherAgreementId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.partnerAllocation.count({ where: { partnerUserId: userId, createdAt: { gte: period.from, lt: period.to } } }),
    ]);
    return { data: data.map((row) => ({ ...row, basis: this.money(row.basisMinor), amount: this.money(row.amountMinor) })), meta: toPaginationMeta(page, limit, total) };
  }

  private async usage(userId: string, query: PartnerQuestionUsageQueryDto) {
    await this.publisher(userId); const period = this.period(query);
    if (DateTime.fromJSDate(period.to).diff(DateTime.fromJSDate(period.from), 'days').days > 93) throw new BadRequestException('Question-usage ranges are limited to 93 days');
    const attempts = await this.prisma.assessmentAttempt.findMany({ where: { startedAt: { gte: period.from, lt: period.to } }, select: {
      studentUserId: true, startedAt: true,
      assessment: { select: { questions: { select: { id: true, sourceQuestionId: true, body: true, attributions: { where: { publisherUserId: userId, ...(query.sourceId ? { sourceId: query.sourceId } : {}) }, select: { sourceId: true, sourceTitle: true } } } } } },
      answers: { select: { assessmentQuestionId: true, isCorrect: true, gradedAt: true } },
    } });
    const sources = new Map<string, any>(); const questions = new Map<string, any>(); const occurrences = new Map<string, Array<{ startedAt: Date; sourceId: string }>>();
    const source = (id: string, title: string | null) => sources.get(id) ?? { sourceId: id, sourceTitle: title, presented: 0, solved: 0, correct: 0, graded: 0, unique: new Set<string>(), reattempts: 0 };
    for (const attempt of attempts) {
      const answers = new Map(attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]));
      for (const question of attempt.assessment.questions) for (const attribution of question.attributions) {
        const sourceId = attribution.sourceId ?? 'unknown'; const row = source(sourceId, attribution.sourceTitle); row.presented += 1; sources.set(sourceId, row);
        const questionKey = `${sourceId}:${question.sourceQuestionId}`; const questionRow = questions.get(questionKey) ?? { sourceId, sourceTitle: attribution.sourceTitle, sourceQuestionId: question.sourceQuestionId, presented: 0, solved: 0, correct: 0, graded: 0, unique: new Set<string>(), reattempts: 0 };
        questionRow.presented += 1; questions.set(questionKey, questionRow);
        const answer = answers.get(question.id); if (!answer) continue;
        row.solved += 1; row.unique.add(attempt.studentUserId); questionRow.solved += 1; questionRow.unique.add(attempt.studentUserId);
        if (answer.isCorrect !== null) { row.graded += 1; questionRow.graded += 1; if (answer.isCorrect) { row.correct += 1; questionRow.correct += 1; } }
        const occurrenceKey = `${attempt.studentUserId}:${questionKey}`; const list = occurrences.get(occurrenceKey) ?? []; list.push({ startedAt: attempt.startedAt, sourceId }); occurrences.set(occurrenceKey, list);
      }
    }
    for (const list of occurrences.values()) if (list.length > 1) { list.sort((a, b) => a.startedAt.valueOf() - b.startedAt.valueOf()); const sourceRow = sources.get(list[0].sourceId); if (sourceRow) sourceRow.reattempts += list.length - 1; }
    const available = await this.prisma.question.count({ where: { source: { publisherUserId: userId, status: 'PUBLISHED' }, status: 'PUBLISHED', ...(query.sourceId ? { sourceId: query.sourceId } : {}) } });
    const normalize = (row: any) => ({ ...row, uniqueSolvers: row.unique.size, usageRate: { numerator: row.solved, denominator: row.presented, value: row.presented ? row.solved / row.presented : 0 }, correctRate: { numerator: row.correct, denominator: row.graded, value: row.graded ? row.correct / row.graded : null } });
    const sourceRows = [...sources.values()].map(normalize); const questionRows = [...questions.values()].map(normalize);
    return { period, available, sourceRows, questionRows, totals: normalize(sourceRows.reduce((total: any, row: any) => ({ sourceId: 'all', sourceTitle: null, presented: total.presented + row.presented, solved: total.solved + row.solved, correct: total.correct + row.correct, graded: total.graded + row.graded, unique: new Set([...total.unique, ...row.unique]), reattempts: total.reattempts + row.reattempts }), { sourceId: 'all', sourceTitle: null, presented: 0, solved: 0, correct: 0, graded: 0, unique: new Set<string>(), reattempts: 0 })) };
  }
  async questionUsage(userId: string, query: PartnerQuestionUsageQueryDto) { const usage = await this.usage(userId, query); return { period: { from: usage.period.fromDate, to: usage.period.toDate, timeZone: CAIRO }, availableQuestions: usage.available, ...usage.totals, metricDefinitions: { presented: 'Frozen publisher-attributed assessment questions in started attempts.', solved: 'Presented questions with a submitted answer.', uniqueSolvers: 'Distinct students with at least one submitted answer.', correctRate: 'Correct final answers divided by graded answers.', usageRate: 'Solved questions divided by presented questions.' } }; }
  async questionUsageSources(userId: string, query: PartnerQuestionUsageQueryDto) { const usage = await this.usage(userId, query); const data = usage.sourceRows.sort((a, b) => b.solved - a.solved || a.sourceId.localeCompare(b.sourceId)); return { data: data.slice((query.page - 1) * query.limit, query.page * query.limit), meta: toPaginationMeta(query.page, query.limit, data.length) }; }
  async questionUsageQuestions(userId: string, query: PartnerQuestionUsageQueryDto) { const usage = await this.usage(userId, query); const data = usage.questionRows.sort((a, b) => b.solved - a.solved || a.sourceQuestionId.localeCompare(b.sourceQuestionId)); return { data: data.slice((query.page - 1) * query.limit, query.page * query.limit), meta: toPaginationMeta(query.page, query.limit, data.length) }; }

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
