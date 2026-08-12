import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  PartnerType,
  PublisherAgreementStatus,
  OrderStatus,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import type {
  PartnerContentQueryDto,
  PartnerEarningsQueryDto,
  PartnerPeriodQueryDto,
  PartnerStatementsQueryDto,
} from './dto/partner-analytics.dto';

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
  revenueShareBps: number;
};

@Injectable()
export class PartnerAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private label(date: Date, granularity: 'day' | 'month') {
    const zoned = DateTime.fromJSDate(date).setZone(CAIRO);
    return granularity === 'day'
      ? zoned.toISODate()!
      : zoned.toFormat('yyyy-LL');
  }

  private isCurrent(agreement: Agreement, at = new Date()) {
    return (
      agreement.status === PublisherAgreementStatus.ACTIVE &&
      agreement.startsAt <= at &&
      (!agreement.endsAt || agreement.endsAt > at)
    );
  }

  private resolve(
    agreements: Agreement[],
    courseId: string | null,
    chapterId: string | null,
    at: Date,
  ) {
    const keys = [
      chapterId ? (['chapterId', chapterId] as const) : null,
      courseId ? (['courseId', courseId] as const) : null,
    ].filter(Boolean) as Array<readonly ['chapterId' | 'courseId', string]>;
    for (const [field, id] of keys) {
      const match = agreements.find(
        (agreement) =>
          agreement[field] === id &&
          agreement.startsAt <= at &&
          (!agreement.endsAt || agreement.endsAt > at),
      );
      if (match) return match;
    }
    return null;
  }

  private async agreementsFor(userId: string) {
    return this.prisma.publisherAgreement.findMany({
      where: {
        publisherUserId: userId,
        isPrimary: true,
        status: {
          in: [PublisherAgreementStatus.ACTIVE, PublisherAgreementStatus.ENDED],
        },
      },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    }) as Promise<Agreement[]>;
  }

  private async estimatedOrders(userId: string, period: Period) {
    const [agreements, orders] = await Promise.all([
      this.agreementsFor(userId),
      this.prisma.order.findMany({
        where: {
          status: OrderStatus.APPROVED,
          approvedAt: { gte: period.from, lt: period.to },
        },
        select: {
          id: true,
          studentUserId: true,
          approvedAt: true,
          items: {
            select: {
              priceMinor: true,
              currency: true,
              courseId: true,
              chapterId: true,
              chapter: { select: { courseId: true } },
            },
          },
        },
      }),
    ]);
    const rows: Array<{
      orderId: string;
      studentUserId: string;
      approvedAt: Date;
      grossRevenueMinor: number;
      publisherEarningsMinor: number;
    }> = [];
    for (const order of orders) {
      if (!order.approvedAt) continue;
      for (const item of order.items) {
        if (item.currency !== EGP) continue;
        const agreement = this.resolve(
          agreements,
          item.courseId ?? item.chapter?.courseId ?? null,
          item.chapterId,
          order.approvedAt,
        );
        if (!agreement) continue;
        rows.push({
          orderId: order.id,
          studentUserId: order.studentUserId,
          approvedAt: order.approvedAt,
          grossRevenueMinor: item.priceMinor,
          publisherEarningsMinor: Math.floor(
            (item.priceMinor * agreement.revenueShareBps) / 10_000,
          ),
        });
      }
    }
    return rows;
  }

  private async realizedStatements(userId: string, period: Period) {
    return this.prisma.publisherEarningsStatement.findMany({
      where: {
        agreement: { publisherUserId: userId },
        periodEndsAt: { gte: period.from, lt: period.to },
      },
      select: {
        id: true,
        periodStartsAt: true,
        periodEndsAt: true,
        grossRevenueMinor: true,
        publisherEarningsMinor: true,
        currency: true,
      },
    });
  }

  private summarizeEstimated(
    rows: Awaited<ReturnType<PartnerAnalyticsService['estimatedOrders']>>,
  ) {
    return {
      grossRevenue: this.money(
        rows.reduce((sum, row) => sum + row.grossRevenueMinor, 0),
      ),
      earnings: this.money(
        rows.reduce((sum, row) => sum + row.publisherEarningsMinor, 0),
      ),
      approvedOrders: new Set(rows.map((row) => row.orderId)).size,
      customers: new Set(rows.map((row) => row.studentUserId)).size,
    };
  }

  async dashboard(userId: string, query: PartnerPeriodQueryDto) {
    await this.publisher(userId);
    const period = this.period(query);
    const [agreements, estimated, statements] = await Promise.all([
      this.agreementsFor(userId),
      this.estimatedOrders(userId, period),
      this.realizedStatements(userId, period),
    ]);
    const realizedGross = statements.reduce(
      (sum, item) => sum + item.grossRevenueMinor,
      0,
    );
    const realizedEarnings = statements.reduce(
      (sum, item) => sum + item.publisherEarningsMinor,
      0,
    );
    const trend = await this.earningsFor(userId, period, 'day');
    const current = agreements.filter((agreement) => this.isCurrent(agreement));
    const coveredContent = new Set(
      agreements.map((agreement) =>
        agreement.courseId
          ? `course:${agreement.courseId}`
          : agreement.chapterId
            ? `chapter:${agreement.chapterId}`
            : `lesson:${agreement.lessonId}`,
      ),
    );
    return {
      period: { from: period.fromDate, to: period.toDate, timeZone: CAIRO },
      metricDefinitions: {
        realized:
          'Admin-issued earnings statements filtered by statement period end.',
        estimated:
          'Approved order items attributed using the publisher agreement effective at order approval time.',
      },
      kpis: {
        realizedGrossRevenue: this.money(realizedGross),
        realizedEarnings: this.money(realizedEarnings),
        estimated: this.summarizeEstimated(estimated),
        activeAgreements: current.length,
        coveredContent: coveredContent.size,
      },
      trend: trend.data,
      latestStatements: (await this.statements(userId, { page: 1, limit: 5 }))
        .data,
    };
  }

  private async earningsFor(
    userId: string,
    period: Period,
    granularity: 'day' | 'month',
  ) {
    const [estimated, statements] = await Promise.all([
      this.estimatedOrders(userId, period),
      this.realizedStatements(userId, period),
    ]);
    const rows = new Map<
      string,
      {
        period: string;
        estimatedGrossRevenue: number;
        estimatedEarnings: number;
        realizedGrossRevenue: number;
        realizedEarnings: number;
      }
    >();
    const row = (key: string) =>
      rows.get(key) ?? {
        period: key,
        estimatedGrossRevenue: 0,
        estimatedEarnings: 0,
        realizedGrossRevenue: 0,
        realizedEarnings: 0,
      };
    for (const item of estimated) {
      const key = this.label(item.approvedAt, granularity);
      const value = row(key);
      value.estimatedGrossRevenue += item.grossRevenueMinor;
      value.estimatedEarnings += item.publisherEarningsMinor;
      rows.set(key, value);
    }
    for (const item of statements) {
      if (item.currency !== EGP) continue;
      const key = this.label(item.periodEndsAt, granularity);
      const value = row(key);
      value.realizedGrossRevenue += item.grossRevenueMinor;
      value.realizedEarnings += item.publisherEarningsMinor;
      rows.set(key, value);
    }
    return {
      data: [...rows.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((item) => ({
          period: item.period,
          estimatedGrossRevenue: this.money(item.estimatedGrossRevenue),
          estimatedEarnings: this.money(item.estimatedEarnings),
          realizedGrossRevenue: this.money(item.realizedGrossRevenue),
          realizedEarnings: this.money(item.realizedEarnings),
        })),
    };
  }

  async earnings(userId: string, query: PartnerEarningsQueryDto) {
    await this.publisher(userId);
    const period = this.period(query);
    const days = DateTime.fromJSDate(period.to).diff(
      DateTime.fromJSDate(period.from),
      'days',
    ).days;
    const granularity = query.granularity ?? (days <= 93 ? 'day' : 'month');
    return {
      period: { from: period.fromDate, to: period.toDate, timeZone: CAIRO },
      granularity,
      metricDefinitions: {
        realized: 'Admin-issued statements by period end.',
        estimated:
          'Approved order items attributed at approval time; not a settlement record.',
      },
      ...(await this.earningsFor(userId, period, granularity)),
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
        revenueShareBps: item.revenueShareBps,
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

  async statements(userId: string, query: PartnerStatementsQueryDto) {
    await this.publisher(userId);
    const period = query.from || query.to ? this.period(query) : null;
    const where = {
      agreement: { publisherUserId: userId },
      ...(period ? { periodEndsAt: { gte: period.from, lt: period.to } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.publisherEarningsStatement.findMany({
        where,
        include: {
          agreement: true,
          course: { select: { title: true } },
          chapter: { select: { title: true } },
          lesson: { select: { title: true } },
        },
        orderBy: [{ periodEndsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.publisherEarningsStatement.count({ where }),
    ]);
    return {
      data: data.map((item) => ({
        id: item.id,
        periodStartsAt: item.periodStartsAt,
        periodEndsAt: item.periodEndsAt,
        grossRevenue: this.money(item.grossRevenueMinor),
        earnings: this.money(item.publisherEarningsMinor),
        revenueShareBps: item.revenueShareBps,
        createdAt: item.createdAt,
        agreementId: item.agreementId,
        target: item.course
          ? { type: 'COURSE', id: item.courseId, title: item.course.title }
          : item.chapter
            ? { type: 'CHAPTER', id: item.chapterId, title: item.chapter.title }
            : {
                type: 'LESSON',
                id: item.lessonId,
                title: item.lesson?.title ?? null,
              },
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
}
