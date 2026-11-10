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

  it('selects the higher-priority timed campaign even when its discount is smaller', async () => {
    const quote = await service({
      campaigns: [
        {
          id: 'campaign-10',
          name: 'Ten',
          kind: 'PERCENTAGE',
          amount: 1000,
          priority: 10,
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
    expect(quote.discountMinor).toBe(1_000);
    expect(quote.items[0]).toMatchObject({
      finalPriceMinor: 9_000,
      promotionSnapshot: {
        source: 'CAMPAIGN',
        campaignId: 'campaign-10',
        priority: 10,
      },
    });
  });

  it('uses the larger timed campaign discount when campaign priorities are equal', async () => {
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

    expect(quote.items[0].promotionSnapshot).toMatchObject({
      source: 'CAMPAIGN',
      campaignId: 'campaign-20',
    });
  });

  it('uses a higher-priority coupon even when its discount is smaller', async () => {
    const now = new Date();
    const coupon = {
      id: 'coupon-1',
      code: 'EXAM',
      name: 'Exam',
      kind: 'PERCENTAGE',
      amount: 1000,
      priority: 10,
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

    expect(quote.discountMinor).toBe(1_000);
    expect(quote.coupon).toMatchObject({
      id: 'coupon-1',
      discountMinor: 1_000,
    });
    expect(quote.items[0].promotionSnapshot).toMatchObject({
      source: 'COUPON',
      code: 'EXAM',
      priority: 10,
    });
  });

  it('uses the stable lowest ID when priorities and discounts are equal', async () => {
    const quote = await service({
      campaigns: [
        {
          id: 'campaign-z',
          name: 'Z',
          kind: 'PERCENTAGE',
          amount: 2000,
          priority: 5,
          appliesToAll: true,
          targets: [],
        },
        {
          id: 'campaign-a',
          name: 'A',
          kind: 'PERCENTAGE',
          amount: 2000,
          priority: 5,
          appliesToAll: true,
          targets: [],
        },
      ],
    }).quote([target]);

    expect(quote.items[0].promotionSnapshot).toMatchObject({
      source: 'CAMPAIGN',
      campaignId: 'campaign-a',
    });
  });

  it('does not apply campaigns or capped coupon remainders to bundles', async () => {
    const now = Date.now();
    const coupon = {
      id: 'coupon',
      code: 'MIXED',
      name: 'Mixed',
      kind: 'PERCENTAGE',
      amount: 3333,
      priority: 5,
      startsAt: new Date(now - 1000),
      endsAt: new Date(now + 60_000),
      isActive: true,
      appliesToAll: true,
      minimumOrderMinor: 0,
      maximumDiscountMinor: 1000,
      usageLimit: null,
      perStudentUsageLimit: null,
      targets: [],
    };
    const campaign = {
      id: 'campaign',
      name: 'All',
      kind: 'PERCENTAGE',
      amount: 1000,
      priority: 1,
      appliesToAll: true,
      targets: [],
    };
    const bundle = {
      targetType: 'BUNDLE' as const,
      salesOfferId: 'offer',
      title: 'Bundle',
      basePriceMinor: 701,
      currency: 'EGP',
    };
    const quote = await service({ coupon, campaigns: [campaign] }).quote(
      [target, bundle],
      'MIXED',
    );
    expect(quote.items[0].discountMinor).toBe(1000);
    expect(quote.items[1]).toMatchObject({
      discountMinor: 0,
      finalPriceMinor: 701,
      promotionSnapshot: null,
    });
    await expect(service({ coupon }).quote([bundle], 'MIXED')).rejects.toThrow(
      'Coupon does not apply',
    );
  });

  it('splits a capped total discount without negative item prices', async () => {
    const now = Date.now();
    const coupon = {
      id: 'coupon',
      code: 'CAP',
      name: 'Cap',
      kind: 'PERCENTAGE',
      amount: 10_000,
      priority: 0,
      startsAt: new Date(now - 1000),
      endsAt: new Date(now + 60_000),
      isActive: true,
      appliesToAll: true,
      minimumOrderMinor: 0,
      maximumDiscountMinor: 2,
      usageLimit: null,
      perStudentUsageLimit: null,
      targets: [],
    };
    const items = [1, 2, 3].map((id) => ({
      ...target,
      courseId: `course-${id}`,
      basePriceMinor: 1,
    }));
    const quote = await service({ coupon }).quote(items, 'CAP');
    expect(quote.discountMinor).toBe(2);
    expect(quote.totalMinor).toBe(1);
    expect(quote.items.map((item) => item.discountMinor)).toEqual([1, 1, 0]);
    expect(quote.items.every((item) => item.finalPriceMinor >= 0)).toBe(true);
  });

  it('applies a fixed coupon once to the eligible total and weights its shares by price', async () => {
    const now = Date.now();
    const coupon = {
      id: 'coupon',
      code: 'FIXED',
      name: 'Fixed',
      kind: 'FIXED',
      amount: 4000,
      priority: 0,
      startsAt: new Date(now - 1000),
      endsAt: new Date(now + 60_000),
      isActive: true,
      appliesToAll: true,
      minimumOrderMinor: 0,
      maximumDiscountMinor: null,
      usageLimit: null,
      perStudentUsageLimit: null,
      targets: [],
    };
    const quote = await service({ coupon }).quote(
      [target, { ...target, courseId: 'course-2', basePriceMinor: 30_000 }],
      'FIXED',
    );
    expect(quote.items.map((item) => item.discountMinor)).toEqual([1000, 3000]);
    expect(quote.totalMinor).toBe(36_000);
  });
});
