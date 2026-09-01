import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  PartnerAllocationKind,
  PartnerType,
  Role,
} from '../../common/types/roles.enum';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { ReferralReportingQueryDto } from './dto/referrals.dto';

const CAIRO = 'Africa/Cairo';
type Period = {
  from: Date;
  to: Date;
  fromDate: string;
  toDate: string;
  granularity: 'day' | 'month';
};

@Injectable()
export class ReferralReportingService {
  private readonly minimumCohort: number;
  private readonly partnerLedgerEnabled: boolean;
  private readonly partnerLedgerAllowedUserIds: string[];
  constructor(
    private readonly prisma: PrismaService,
    config?: ConfigService<AppConfig, true>,
  ) {
    this.minimumCohort =
      config?.get('privacy', { infer: true })?.referralPartnerMinimumCohort ??
      1;
    const features = config?.get('features', { infer: true }) ?? {
      partnerLedgerEnabled: true,
      partnerLedgerAllowedUserIds: [],
    };
    this.partnerLedgerEnabled = features.partnerLedgerEnabled;
    this.partnerLedgerAllowedUserIds = features.partnerLedgerAllowedUserIds;
  }
  private period(query: ReferralReportingQueryDto): Period {
    const now = DateTime.now().setZone(CAIRO);
    const fromDate = query.from ?? now.startOf('month').toISODate()!;
    const toDate = query.to ?? now.endOf('month').toISODate()!;
    const from = DateTime.fromISO(fromDate, { zone: CAIRO }).startOf('day');
    const to = DateTime.fromISO(toDate, { zone: CAIRO })
      .plus({ days: 1 })
      .startOf('day');
    if (!from.isValid || !to.isValid || to <= from)
      throw new BadRequestException('from must be on or before to');
    const days = to.diff(from, 'days').days;
    return {
      from: from.toUTC().toJSDate(),
      to: to.toUTC().toJSDate(),
      fromDate,
      toDate,
      granularity: query.granularity ?? (days > 93 ? 'month' : 'day'),
    };
  }
  private async referralPartner(userId: string, requireLedgerAccess = true) {
    const profile = await this.prisma.partnerProfile.findUnique({
      where: { userId },
      select: { partnerType: true },
    });
    if (!profile || profile.partnerType !== PartnerType.REFERRAL_PARTNER)
      throw new ForbiddenException(
        'Referral reporting is not available for this partner',
      );
    if (requireLedgerAccess) this.assertPartnerLedgerAccess(userId);
  }
  private assertPartnerLedgerAccess(userId: string) {
    const allowlist = this.partnerLedgerAllowedUserIds;
    if (
      !this.partnerLedgerEnabled ||
      (allowlist.length > 0 &&
        !allowlist.includes('*') &&
        !allowlist.includes(userId))
    )
      throw new ConflictException(
        'Partner ledger reporting is disabled by rollout control',
      );
  }
  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private bucket(date: Date, granularity: 'day' | 'month'): string {
    const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(CAIRO);
    return granularity === 'month' ? dt.toFormat('yyyy-LL') : dt.toISODate()!;
  }
  private publicPeriod(period: Period) {
    return { from: period.fromDate, to: period.toDate, timeZone: CAIRO };
  }
  private async report(
    partnerUserId: string,
    query: ReferralReportingQueryDto,
    privacySafe: boolean,
  ) {
    const period = this.period(query);
    const attributions = await this.prisma.orderReferralAttribution.findMany({
      where: {
        referralProgram: { partnerUserId },
        OR: [
          { createdAt: { gte: period.from, lt: period.to } },
          {
            order: {
              status: 'APPROVED',
              approvedAt: { gte: period.from, lt: period.to },
            },
          },
        ],
      },
      select: {
        id: true,
        studentUserId: true,
        createdAt: true,
        order: {
          select: {
            status: true,
            approvedAt: true,
            items: {
              select: {
                priceMinor: true,
                course: {
                  select: {
                    id: true,
                    title: true,
                    subject: { select: { id: true, title: true } },
                  },
                },
                chapter: {
                  select: {
                    id: true,
                    title: true,
                    course: {
                      select: {
                        id: true,
                        title: true,
                        subject: { select: { id: true, title: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const allocationRows = await this.prisma.partnerAllocation.groupBy({
      by: ['state', 'currency'],
      where: {
        partnerUserId,
        kind: PartnerAllocationKind.REFERRAL_COMMISSION,
        createdAt: { gte: period.from, lt: period.to },
      },
      _count: true,
      _sum: { amountMinor: true, basisMinor: true },
    });
    const conversions = attributions.filter(
      (row) => row.createdAt >= period.from && row.createdAt < period.to,
    );
    const approved = attributions.filter(
      (row) =>
        row.order.status === 'APPROVED' &&
        row.order.approvedAt &&
        row.order.approvedAt >= period.from &&
        row.order.approvedAt < period.to,
    );
    const cohort = new Set(approved.map((row) => row.studentUserId)).size;
    if (privacySafe && cohort < this.minimumCohort)
      return {
        period: this.publicPeriod(period),
        privacy: {
          minimumCohort: this.minimumCohort,
          suppressed: true,
          reason: 'The selected period has too few approved referred learners.',
        },
        metricDefinitions: this.definitions(),
      };
    const products = new Map<string, any>();
    const categories = new Map<string, any>();
    const trends = new Map<string, any>();
    for (const attribution of conversions) {
      const key = this.bucket(attribution.createdAt, period.granularity);
      const trend = trends.get(key) ?? {
        period: key,
        conversions: 0,
        approvedSales: 0,
        approvedSalesMinor: 0,
        learners: new Set<string>(),
      };
      trend.conversions += 1;
      trend.learners.add(attribution.studentUserId);
      trends.set(key, trend);
    }
    for (const attribution of approved) {
      if (!attribution.order.approvedAt) continue;
      const key = this.bucket(attribution.order.approvedAt, period.granularity);
      const trend = trends.get(key) ?? {
        period: key,
        conversions: 0,
        approvedSales: 0,
        approvedSalesMinor: 0,
        learners: new Set<string>(),
      };
      trend.approvedSales += 1;
      trend.approvedSalesMinor += attribution.order.items.reduce(
        (sum, item) => sum + item.priceMinor,
        0,
      );
      trend.learners.add(attribution.studentUserId);
      trends.set(key, trend);
      for (const item of attribution.order.items) {
        const product = item.course
          ? {
              id: item.course.id,
              title: item.course.title,
              category: item.course.subject,
            }
          : {
              id: item.chapter!.id,
              title: item.chapter!.title,
              category: item.chapter!.course.subject,
            };
        const productRow = products.get(product.id) ?? {
          productId: product.id,
          productTitle: product.title,
          approvedSales: 0,
          approvedSalesMinor: 0,
          learners: new Set<string>(),
        };
        productRow.approvedSales += 1;
        productRow.approvedSalesMinor += item.priceMinor;
        productRow.learners.add(attribution.studentUserId);
        products.set(product.id, productRow);
        const categoryRow = categories.get(product.category.id) ?? {
          categoryId: product.category.id,
          categoryTitle: product.category.title,
          approvedSales: 0,
          approvedSalesMinor: 0,
          learners: new Set<string>(),
        };
        categoryRow.approvedSales += 1;
        categoryRow.approvedSalesMinor += item.priceMinor;
        categoryRow.learners.add(attribution.studentUserId);
        categories.set(product.category.id, categoryRow);
      }
    }
    const safeRows = (rows: any[]) =>
      rows
        .filter(
          (row) => !privacySafe || row.learners.size >= this.minimumCohort,
        )
        .map(({ learners, ...row }) => ({ ...row, learners: learners.size }));
    const safeTrends = safeRows([...trends.values()]);
    return {
      period: this.publicPeriod(period),
      privacy: {
        minimumCohort: this.minimumCohort,
        suppressed: false,
        breakdownsSuppressSmallCohorts: privacySafe,
      },
      conversions: conversions.length,
      approvedSales: {
        orders: approved.length,
        learners: cohort,
        amountMinor: approved.reduce(
          (sum, row) =>
            sum +
            row.order.items.reduce(
              (itemSum, item) => itemSum + item.priceMinor,
              0,
            ),
          0,
        ),
        currency: 'EGP',
      },
      commissionStates: allocationRows.map((row) => ({
        state: row.state,
        allocations: row._count,
        amountMinor: row._sum.amountMinor ?? 0,
        basisMinor: row._sum.basisMinor ?? 0,
        currency: row.currency,
      })),
      trends: safeTrends.sort((a, b) => a.period.localeCompare(b.period)),
      products: safeRows([...products.values()]).sort(
        (a, b) =>
          b.approvedSalesMinor - a.approvedSalesMinor ||
          a.productTitle.localeCompare(b.productTitle),
      ),
      categories: safeRows([...categories.values()]).sort(
        (a, b) =>
          b.approvedSalesMinor - a.approvedSalesMinor ||
          a.categoryTitle.localeCompare(b.categoryTitle),
      ),
      suppressedBreakdowns: privacySafe
        ? {
            productOrCategoryGroupsBelowMinimumAreOmitted: true,
            trendPeriodsBelowMinimumAreOmitted: true,
          }
        : undefined,
      metricDefinitions: this.definitions(),
    };
  }
  private definitions() {
    return {
      conversions:
        'Orders that captured a referral attribution in the selected Cairo date range, whether or not later approved.',
      approvedSales:
        'Referral-attributed orders approved in the selected Cairo date range.',
      commissionStates:
        'Immutable referral commission allocation rows created in the selected range, grouped by current ledger state. Reversal rows are represented through their ledger state and amount.',
      productsAndCategories:
        'Approved order-item sales; partner-facing rows with fewer than the configured number of distinct referred learners are omitted.',
    };
  }
  async partnerReport(userId: string, query: ReferralReportingQueryDto) {
    await this.referralPartner(userId);
    return this.report(userId, query, true);
  }
  async adminReport(
    actor: RequestUser,
    partnerUserId: string,
    query: ReferralReportingQueryDto,
  ) {
    this.admin(actor);
    await this.referralPartner(partnerUserId, false);
    return this.report(partnerUserId, query, false);
  }
  async partnerSettlements(userId: string, query: ReferralReportingQueryDto) {
    await this.referralPartner(userId);
    const period = this.period(query);
    const rows = await this.prisma.partnerSettlement.findMany({
      where: {
        partnerUserId: userId,
        createdAt: { gte: period.from, lt: period.to },
        lines: {
          some: {
            allocation: { kind: PartnerAllocationKind.REFERRAL_COMMISSION },
          },
        },
      },
      select: {
        createdAt: true,
        paidAt: true,
        currency: true,
        lines: {
          where: {
            allocation: { kind: PartnerAllocationKind.REFERRAL_COMMISSION },
          },
          select: { allocation: { select: { amountMinor: true } } },
        },
      },
    });
    return {
      period: this.publicPeriod(period),
      privacy: {
        minimumCohort: this.minimumCohort,
        settlementRowsBelowMinimumAreOmitted: true,
      },
      data: rows
        .filter((row) => row.lines.length >= this.minimumCohort)
        .map((row) => ({
          createdAt: row.createdAt,
          paidAt: row.paidAt,
          currency: row.currency,
          totalMinor: row.lines.reduce(
            (sum, line) => sum + line.allocation.amountMinor,
            0,
          ),
          allocationCount: row.lines.length,
        })),
    };
  }
}
