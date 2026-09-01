import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../database/prisma.service';

const CAIRO = 'Africa/Cairo';
const EGP = 'EGP';

@Injectable()
export class LedgerPublisherEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  private money(amountMinor = 0) {
    return { amountMinor, currency: EGP };
  }

  private label(date: Date, granularity: 'day' | 'month') {
    const zoned = DateTime.fromJSDate(date).setZone(CAIRO);
    return granularity === 'day'
      ? zoned.toISODate()!
      : zoned.toFormat('yyyy-LL');
  }

  /**
   * REVERSED original rows remain audit history only.  The compensating,
   * signed allocation is the financial event, so counting both would reverse
   * revenue twice.
   */
  private financial(row: { state: string }) {
    return row.state !== 'REVERSED';
  }

  async report(
    publisherUserId: string,
    period: { from: Date; to: Date; fromDate: string; toDate: string },
    granularity: 'day' | 'month',
  ) {
    const rows = await this.prisma.partnerAllocation.findMany({
      where: {
        partnerUserId: publisherUserId,
        kind: 'PUBLISHER_SALE',
        createdAt: { gte: period.from, lt: period.to },
      },
      include: {
        publisherAgreement: {
          select: {
            id: true,
            version: true,
            contractReference: true,
            courseId: true,
            chapterId: true,
            lessonId: true,
          },
        },
        orderItem: {
          select: { courseId: true, chapterId: true, titleSnapshot: true },
        },
        settlementLines: {
          select: { settlement: { select: { id: true, paidAt: true } } },
        },
      },
    });
    const totals = {
      earned: 0,
      reversals: 0,
      net: 0,
      payable: 0,
      paid: 0,
      pending: 0,
    };
    const trends = new Map<
      string,
      {
        period: string;
        earned: number;
        reversals: number;
        net: number;
        payable: number;
        paid: number;
      }
    >();
    const agreements = new Map<
      string,
      {
        agreementId: string | null;
        version: number | null;
        contractReference: string | null;
        target: object;
        earned: number;
        reversals: number;
        net: number;
        payable: number;
        paid: number;
      }
    >();
    for (const row of rows) {
      if (row.currency !== EGP || !this.financial(row)) continue;
      const amount = row.amountMinor;
      const reversal = amount < 0 ? -amount : 0;
      totals.earned += amount > 0 ? amount : 0;
      totals.reversals += reversal;
      totals.net += amount;
      if (row.state === 'PAYABLE') totals.payable += amount;
      if (row.state === 'PAID') totals.paid += amount;
      if (row.state === 'PENDING') totals.pending += amount;
      const key = this.label(row.createdAt, granularity);
      const trend = trends.get(key) ?? {
        period: key,
        earned: 0,
        reversals: 0,
        net: 0,
        payable: 0,
        paid: 0,
      };
      trend.earned += amount > 0 ? amount : 0;
      trend.reversals += reversal;
      trend.net += amount;
      if (row.state === 'PAYABLE') trend.payable += amount;
      if (row.state === 'PAID') trend.paid += amount;
      trends.set(key, trend);
      const agreement = row.publisherAgreement;
      const agreementKey = agreement?.id ?? 'unlinked';
      const target = agreement?.courseId
        ? { type: 'COURSE', id: agreement.courseId }
        : agreement?.chapterId
          ? { type: 'CHAPTER', id: agreement.chapterId }
          : agreement?.lessonId
            ? { type: 'LESSON', id: agreement.lessonId }
            : {
                type: row.orderItem.courseId ? 'COURSE' : 'CHAPTER',
                id: row.orderItem.courseId ?? row.orderItem.chapterId,
              };
      const breakdown = agreements.get(agreementKey) ?? {
        agreementId: agreement?.id ?? null,
        version: agreement?.version ?? null,
        contractReference: agreement?.contractReference ?? null,
        target,
        earned: 0,
        reversals: 0,
        net: 0,
        payable: 0,
        paid: 0,
      };
      breakdown.earned += amount > 0 ? amount : 0;
      breakdown.reversals += reversal;
      breakdown.net += amount;
      if (row.state === 'PAYABLE') breakdown.payable += amount;
      if (row.state === 'PAID') breakdown.paid += amount;
      agreements.set(agreementKey, breakdown);
    }
    const asMoney = (item: Record<string, any>) =>
      Object.fromEntries(
        Object.entries(item).map(([key, value]) =>
          /earned|reversals|net|payable|paid|pending/.test(key)
            ? [key, this.money(value as number)]
            : [key, value],
        ),
      );
    return {
      period: { from: period.fromDate, to: period.toDate, timeZone: CAIRO },
      granularity,
      metricDefinitions: {
        earned: 'Positive immutable publisher allocation rows.',
        reversals: 'Absolute value of compensating negative allocation rows.',
        net: 'Signed financial allocations; reversed original rows are audit-only and excluded.',
      },
      totals: asMoney(totals),
      trend: [...trends.values()]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(asMoney),
      agreements: [...agreements.values()]
        .sort((a, b) => b.net - a.net)
        .map(asMoney),
    };
  }
}
