import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const target = {
    targetType: 'COURSE' as const,
    courseId: 'course-1',
    title: 'Physics',
    basePriceMinor: 10_000,
    currency: 'EGP',
  };

  function service(input: { campaigns?: any[]; coupon?: any } = {}) {
    const prisma: any = {
      discountCampaign: {
        findMany: jest.fn().mockResolvedValue(input.campaigns ?? []),
      },
      coupon: { findUnique: jest.fn().mockResolvedValue(input.coupon ?? null) },
      couponReservation: { count: jest.fn().mockResolvedValue(0) },
    };
    return new PricingService(prisma);
  }

  it('selects the larger timed campaign discount and snapshots the final item amount', async () => {
    const quote = await service({
      campaigns: [
        {
          id: 'campaign-10',
          name: 'Ten',
          kind: 'PERCENTAGE',
          amount: 1000,
          priority: 0,
          appliesToAll: true,
          targets: [],
        },
        {
          id: 'campaign-20',
          name: 'Twenty',
          kind: 'PERCENTAGE',
          amount: 2000,
          priority: 0,
          appliesToAll: true,
          targets: [],
        },
      ],
    }).quote([target]);

    expect(quote.subtotalMinor).toBe(10_000);
    expect(quote.discountMinor).toBe(2_000);
    expect(quote.items[0]).toMatchObject({
      finalPriceMinor: 8_000,
      promotionSnapshot: { source: 'CAMPAIGN', campaignId: 'campaign-20' },
    });
  });

  it('uses a coupon only when it improves the best automatic campaign price', async () => {
    const now = new Date();
    const coupon = {
      id: 'coupon-1',
      code: 'EXAM',
      name: 'Exam',
      kind: 'PERCENTAGE',
      amount: 3000,
      startsAt: new Date(now.getTime() - 1),
      endsAt: new Date(now.getTime() + 60_000),
      isActive: true,
      appliesToAll: true,
      minimumOrderMinor: 0,
      maximumDiscountMinor: null,
      usageLimit: null,
      perStudentUsageLimit: null,
      targets: [],
    };
    const quote = await service({
      campaigns: [
        {
          id: 'campaign-20',
          name: 'Twenty',
          kind: 'PERCENTAGE',
          amount: 2000,
          priority: 0,
          appliesToAll: true,
          targets: [],
        },
      ],
      coupon,
    }).quote([target], 'exam', 'student-1');

    expect(quote.discountMinor).toBe(3_000);
    expect(quote.coupon).toMatchObject({
      id: 'coupon-1',
      discountMinor: 3_000,
    });
    expect(quote.items[0].promotionSnapshot).toMatchObject({
      source: 'COUPON',
      code: 'EXAM',
    });
  });
});
