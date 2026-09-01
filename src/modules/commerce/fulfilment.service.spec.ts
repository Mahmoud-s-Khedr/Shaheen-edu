import { BadRequestException } from '@nestjs/common';
import { FulfilmentService } from './fulfilment.service';
import {
  OrderStatus,
  PartnerAllocationKind,
} from '../../common/types/roles.enum';

describe('FulfilmentService partner allocations and referral limits', () => {
  const order = (referralAttribution: any = null) => ({
    id: 'order-1',
    studentUserId: 'student-1',
    status: OrderStatus.SUBMITTED,
    paymentChannel: 'MANUAL',
    subtotalMinor: 1000,
    discountMinor: 0,
    totalMinor: 1000,
    currency: 'EGP',
    items: [
      {
        id: 'item-1',
        courseId: 'course-1',
        chapterId: null,
        priceMinor: 1000,
        currency: 'EGP',
        titleSnapshot: 'Course',
        basePriceMinor: 1000,
        discountMinor: 0,
        appliedPromotionSnapshot: null,
        chapter: null,
      },
    ],
    couponReservation: null,
    receipt: null,
    referralAttribution,
  });

  function client(firstOrder: any) {
    const tx: any = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(firstOrder)
          .mockResolvedValueOnce(firstOrder),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      orderReferralAttribution: { count: jest.fn().mockResolvedValue(0) },
      publisherAgreement: { findMany: jest.fn().mockResolvedValue([]) },
      partnerAllocation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentEntitlement: { updateMany: jest.fn(), createMany: jest.fn() },
      paymentReceipt: { create: jest.fn() },
    };
    return tx;
  }

  it('rechecks the approved-order cap under advisory locks before approving an order', async () => {
    const attribution = {
      studentUserId: 'student-1',
      referralCode: { id: 'code-1', usageLimit: 1, perStudentUsageLimit: null },
      rule: {
        program: { id: 'program-1', usageLimit: 1, perStudentUsageLimit: null },
      },
    };
    const tx = client(order(attribution));
    tx.orderReferralAttribution.count.mockResolvedValue(1);

    await expect(
      new FulfilmentService({ recordWithClient: jest.fn() } as any).fulfil(tx, {
        orderId: 'order-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('creates publisher allocations with a retry-safe idempotency key', async () => {
    const tx = client(order());
    tx.publisherAgreement.findMany.mockResolvedValue([
      {
        id: 'agreement-1',
        publisherUserId: 'publisher-1',
        payoutKind: 'PERCENTAGE',
        revenueShareBps: 2500,
        fixedPayoutMinor: null,
        version: 1,
        courseId: 'course-1',
        chapterId: null,
        lessonId: null,
        startsAt: new Date(),
      },
    ]);
    const service = new FulfilmentService({
      recordWithClient: jest.fn(),
    } as any);
    await service.fulfil(tx, { orderId: 'order-1' });

    expect(tx.partnerAllocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [
          expect.objectContaining({
            kind: PartnerAllocationKind.PUBLISHER_SALE,
            amountMinor: 250,
            basisMinor: 1000,
            idempotencyKey: 'publisher-sale:item-1',
          }),
        ],
      }),
    );
  });

  it('prefers a chapter agreement over a course agreement that starts at the same time', async () => {
    const chapterOrder = order();
    chapterOrder.items[0] = {
      ...chapterOrder.items[0],
      courseId: null,
      chapterId: 'chapter-1',
      chapter: { courseId: 'course-1' },
    };
    const tx = client(chapterOrder);
    const startsAt = new Date();
    tx.publisherAgreement.findMany.mockResolvedValue([
      {
        id: 'course-agreement',
        publisherUserId: 'publisher-1',
        payoutKind: 'PERCENTAGE',
        revenueShareBps: 1000,
        fixedPayoutMinor: null,
        version: 1,
        courseId: 'course-1',
        chapterId: null,
        lessonId: null,
        startsAt,
      },
      {
        id: 'chapter-agreement',
        publisherUserId: 'publisher-1',
        payoutKind: 'PERCENTAGE',
        revenueShareBps: 2500,
        fixedPayoutMinor: null,
        version: 1,
        courseId: null,
        chapterId: 'chapter-1',
        lessonId: null,
        startsAt,
      },
    ]);

    await new FulfilmentService({ recordWithClient: jest.fn() } as any).fulfil(
      tx,
      { orderId: 'order-1' },
    );

    expect(tx.partnerAllocation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            publisherAgreementId: 'chapter-agreement',
            amountMinor: 250,
          }),
        ],
      }),
    );
  });
});
