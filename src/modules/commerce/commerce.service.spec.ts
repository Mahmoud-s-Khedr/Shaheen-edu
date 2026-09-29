import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AssetKind,
  AssetStatus,
  ManualPaymentSubmissionStatus,
  OrderStatus,
  PaymentChannel,
  ReferralReviewAction,
  ReferralReviewRuleKind,
  Role,
} from '../../common/types/roles.enum';
import { CommerceService } from './commerce.service';

describe('CommerceService payment proofs', () => {
  const studentUserId = 'student-1';
  const assetId = 'asset-1';

  function build() {
    const prisma: any = {
      manualPaymentSubmission: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
      },
    };
    const assets: any = {
      completeUpload: jest.fn().mockResolvedValue(undefined),
      getReady: jest.fn().mockResolvedValue({
        id: assetId,
        kind: AssetKind.PAYMENT_PROOF,
        status: AssetStatus.READY,
        uploadedById: studentUserId,
      }),
      protectedAccess: jest.fn().mockReturnValue({
        url: 'https://storage.example.test/protected/receipt.png',
        expiresAt: new Date('2026-08-04T10:10:00.000Z'),
      }),
    };
    return {
      service: new CommerceService(prisma, assets, {
        record: jest.fn(),
        recordWithClient: jest.fn(),
      } as any),
      assets,
    };
  }

  it('verifies a direct-uploaded proof before accepting it for submission', async () => {
    const { service, assets } = build();

    await expect(
      (service as any).paymentProof(studentUserId, assetId),
    ).resolves.toMatchObject({ id: assetId });

    expect(assets.completeUpload).toHaveBeenCalledWith(
      { id: studentUserId, role: Role.STUDENT },
      assetId,
    );
    expect(assets.getReady).toHaveBeenCalledWith(assetId);
  });

  it('does not accept a proof when direct-upload verification fails', async () => {
    const { service, assets } = build();
    assets.completeUpload.mockRejectedValue(
      new ConflictException('Asset is not ready'),
    );

    await expect(
      (service as any).paymentProof(studentUserId, assetId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(assets.getReady).not.toHaveBeenCalled();
  });

  it('rejects oversized idempotency keys before storing them', () => {
    const { service } = build();

    expect(() =>
      (service as any).assertIdempotencyKey('x'.repeat(201)),
    ).toThrow(BadRequestException);
  });

  it('returns the documented timestamps for a payment-submission detail', async () => {
    const { service } = build();
    const createdAt = new Date('2026-08-04T10:00:00.000Z');
    const reviewedAt = new Date('2026-08-04T10:05:00.000Z');
    (
      service as any
    ).prisma.manualPaymentSubmission.findUnique.mockResolvedValue({
      id: 'submission-1',
      status: 'REJECTED',
      transactionReference: null,
      note: null,
      rejectionReason: 'Unreadable receipt',
      createdAt,
      reviewedAt,
      proofAssetId: assetId,
      proofAsset: { filename: 'receipt.png', mimeType: 'image/png' },
      order: {
        id: 'order-1',
        status: 'REJECTED',
        totalMinor: 1000,
        currency: 'EGP',
        paymentMethodSnapshot: {
          titleAr: 'تحويل',
          instructionsAr: 'ارفع الإيصال',
          titleEn: null,
          instructionsEn: null,
        },
        createdAt,
        approvedAt: null,
        cancelledAt: null,
        items: [],
      },
    });

    await expect(
      service.submission(
        { id: 'admin-1', role: Role.ADMIN } as any,
        'submission-1',
      ),
    ).resolves.toMatchObject({ createdAt, reviewedAt });
  });

  it('does not create a second submission after another request claims the order', async () => {
    const { service } = build();
    const prisma: any = (service as any).prisma;
    prisma.commerceIdempotencyKey = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    prisma.order = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'order-1',
        studentUserId,
        status: OrderStatus.AWAITING_PAYMENT,
      }),
    };
    const tx: any = {
      order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      manualPaymentSubmission: { create: jest.fn() },
      commerceIdempotencyKey: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback) => callback(tx));

    await expect(
      service.submitProof(studentUserId, 'order-1', 'key-1', {
        assetId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.manualPaymentSubmission.create).not.toHaveBeenCalled();
  });

  it('uses the submission state transition as the approval concurrency gate', async () => {
    const { service } = build();
    const prisma: any = (service as any).prisma;
    const tx: any = {
      manualPaymentSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          status: ManualPaymentSubmissionStatus.SUBMITTED,
          orderId: 'order-1',
          order: { studentUserId, items: [] },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      order: { updateMany: jest.fn() },
      studentEntitlement: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback) => callback(tx));

    await expect(
      service.approve(
        { id: 'admin-1', role: Role.ADMIN } as any,
        'submission-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.studentEntitlement.create).not.toHaveBeenCalled();
  });

  it('uses a non-returning raw query for the payment-method creation lock', async () => {
    const { service } = build();
    const prisma: any = (service as any).prisma;
    const created = { id: 'method-1', sortOrder: 3 };
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      manualPaymentMethod: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 2 } }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(tx));

    await expect(
      service.createMethod({ id: 'admin-1', role: Role.ADMIN } as any, {
        titleAr: 'تحويل',
        instructionsAr: 'ارفع الإيصال',
      }),
    ).resolves.toBe(created);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.manualPaymentMethod.create).toHaveBeenCalledWith({
      data: {
        titleAr: 'تحويل',
        instructionsAr: 'ارفع الإيصال',
        sortOrder: 3,
        createdById: 'admin-1',
      },
    });
  });

  it('moves payment-method positions aside using positive unique positions', async () => {
    const { service } = build();
    const prisma: any = (service as any).prisma;
    const update = jest.fn().mockResolvedValue(undefined);
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      manualPaymentMethod: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', sortOrder: 1 },
          { id: 'b', sortOrder: 2 },
        ]),
        update,
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(tx));
    prisma.manualPaymentMethod = {
      findMany: jest.fn().mockResolvedValue([{ id: 'b' }, { id: 'a' }]),
    };

    await service.reorderMethods({ id: 'admin-1', role: Role.ADMIN } as any, [
      'b',
      'a',
    ]);

    expect(update.mock.calls.map(([call]) => call.data.sortOrder)).toEqual([
      3, 4, 1, 2,
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('CommerceService XPay return lookup', () => {
  const studentUserId = 'student-1';
  const order = {
    id: 'order-1',
    status: OrderStatus.AWAITING_PAYMENT,
    paymentChannel: 'XPAY',
    subtotalMinor: 15000,
    discountMinor: 0,
    totalMinor: 15000,
    currency: 'EGP',
    paymentMethodSnapshot: { provider: 'XPAY', checkout: 'HOSTED_REDIRECT' },
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
    approvedAt: null,
    cancelledAt: null,
    paymentExpiresAt: new Date('2026-09-10T12:30:00.000Z'),
    receipt: null,
    items: [],
    submissions: [],
  };

  function build() {
    const prisma: any = {
      paymentAttempt: { findFirst: jest.fn() },
    };
    return {
      prisma,
      service: new CommerceService(
        prisma,
        {} as any,
        {
          record: jest.fn(),
          recordWithClient: jest.fn(),
        } as any,
      ),
    };
  }

  it('returns the owner’s existing local order for an XPay Checkout Session', async () => {
    const { prisma, service } = build();
    prisma.paymentAttempt.findFirst.mockResolvedValue({ order });

    await expect(
      service.xpayCheckoutSessionOrder(studentUserId, 'cs_test_123'),
    ).resolves.toMatchObject({
      id: order.id,
      status: OrderStatus.AWAITING_PAYMENT,
    });
    expect(prisma.paymentAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerOrderId: 'cs_test_123',
          channel: 'XPAY',
          order: { studentUserId },
        }),
      }),
    );
  });

  it('returns the same generic not-found result for unknown or non-owned sessions', async () => {
    const { prisma, service } = build();
    prisma.paymentAttempt.findFirst.mockResolvedValue(null);

    await expect(
      service.xpayCheckoutSessionOrder(studentUserId, 'cs_test_unknown'),
    ).rejects.toMatchObject({ message: 'Order not found' });
    await expect(
      service.xpayCheckoutSessionOrder('another-student', 'cs_test_123'),
    ).rejects.toMatchObject({ message: 'Order not found' });
  });
});

describe('CommerceService XPay webhooks', () => {
  const rawBody = Buffer.from(
    JSON.stringify({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          paymentIntentId: 'pi_test_1',
          paymentStatus: 'paid',
          amountTotal: 10_000,
          currency: 'EGP',
        },
      },
    }),
  );

  function buildWebhookService(amountTotal = 10_000) {
    const event = { id: 'local-event-1' };
    const tx: any = {
      xPayWebhookEvent: {
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue(event),
      },
      paymentAttempt: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'attempt-1',
          orderId: 'order-1',
          providerTransactionId: null,
          order: { totalMinor: amountTotal, currency: 'EGP' },
        }),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      xPayWebhookEvent: {
        create: jest.fn().mockResolvedValue(event),
        findUnique: jest.fn().mockResolvedValue(event),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const fulfilment = { fulfil: jest.fn() };
    const service = new CommerceService(
      prisma,
      {} as any,
      {} as any,
      undefined,
      { verifyWebhookSignature: jest.fn().mockReturnValue(true) } as any,
      fulfilment as any,
    );
    return { service, tx, prisma, fulfilment };
  }

  it('fulfils only a paid XPay session that matches the immutable order total', async () => {
    const { service, tx, fulfilment } = buildWebhookService();

    await expect(
      service.xpayWebhook(rawBody, 't=1,v1=test'),
    ).resolves.toMatchObject({
      accepted: true,
      success: true,
      orderId: 'order-1',
    });

    expect(tx.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAID',
          providerTransactionId: 'pi_test_1',
        }),
      }),
    );
    expect(fulfilment.fulfil).toHaveBeenCalledWith(tx, {
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
    });
  });

  it('rejects a signed XPay event whose amount does not match the order', async () => {
    const { service, prisma, fulfilment } = buildWebhookService(9_999);

    await expect(
      service.xpayWebhook(rawBody, 't=1,v1=test'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(fulfilment.fulfil).not.toHaveBeenCalled();
    expect(prisma.xPayWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingError: expect.any(String) }),
      }),
    );
  });
});

describe('CommerceService zero-total checkout', () => {
  const studentUserId = 'student-1';
  const zeroTotalOrder = {
    id: 'order-zero',
    status: OrderStatus.APPROVED,
    paymentChannel: PaymentChannel.ZERO_TOTAL,
    subtotalMinor: 0,
    discountMinor: 0,
    totalMinor: 0,
    currency: 'EGP',
    paymentMethodSnapshot: { provider: 'ZERO_TOTAL', checkout: 'NONE' },
    createdAt: new Date('2026-09-29T12:00:00.000Z'),
    approvedAt: new Date('2026-09-29T12:00:00.000Z'),
    cancelledAt: null,
    paymentExpiresAt: null,
    receipt: { reference: 'RCT-20260929-ZERO' },
    items: [],
    submissions: [],
  };

  function build() {
    const tx: any = {
      manualPaymentMethod: { findFirst: jest.fn() },
      order: {
        create: jest.fn().mockResolvedValue({
          id: zeroTotalOrder.id,
          paymentChannel: PaymentChannel.ZERO_TOTAL,
          referralAttribution: null,
        }),
      },
      cartItem: { deleteMany: jest.fn() },
      commerceIdempotencyKey: { create: jest.fn() },
    };
    const prisma: any = {
      commerceIdempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          items: [
            {
              id: 'cart-item-1',
              targetType: 'COURSE',
              courseId: 'course-1',
              chapterId: null,
            },
          ],
        }),
      },
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'course-1',
          title: 'Free course',
          isPurchasable: true,
          priceMinor: 0,
          currency: 'EGP',
        }),
      },
      studentEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
      manualPaymentMethod: { findFirst: jest.fn() },
      order: { findFirst: jest.fn().mockResolvedValue(zeroTotalOrder) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const fulfilment = { fulfil: jest.fn().mockResolvedValue(zeroTotalOrder) };
    const pricing = {
      quote: jest.fn().mockResolvedValue({
        subtotalMinor: 0,
        discountMinor: 0,
        totalMinor: 0,
        coupon: null,
        items: [
          {
            targetType: 'COURSE',
            courseId: 'course-1',
            title: 'Free course',
            basePriceMinor: 0,
            discountMinor: 0,
            finalPriceMinor: 0,
            currency: 'EGP',
            promotionSnapshot: null,
          },
        ],
      }),
    };
    const audit = { record: jest.fn(), recordWithClient: jest.fn() };
    return {
      tx,
      prisma,
      fulfilment,
      service: new CommerceService(
        prisma,
        {} as any,
        audit as any,
        pricing as any,
        undefined,
        fulfilment as any,
      ),
    };
  }

  it('forces a zero-price cart through atomic approval without a payment method or attempt', async () => {
    const { service, prisma, tx, fulfilment } = build();

    await expect(
      service.checkout(
        studentUserId,
        { paymentChannel: PaymentChannel.XPAY },
        'zero-total-key',
      ),
    ).resolves.toMatchObject({
      id: zeroTotalOrder.id,
      status: OrderStatus.APPROVED,
      paymentChannel: PaymentChannel.ZERO_TOTAL,
      paymentExpiresAt: null,
      receiptReference: 'RCT-20260929-ZERO',
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentChannel: PaymentChannel.ZERO_TOTAL,
          paymentMethodSnapshot: { provider: 'ZERO_TOTAL', checkout: 'NONE' },
          paymentExpiresAt: null,
        }),
      }),
    );
    expect(tx.manualPaymentMethod.findFirst).not.toHaveBeenCalled();
    expect(prisma.manualPaymentMethod.findFirst).not.toHaveBeenCalled();
    expect(fulfilment.fulfil).toHaveBeenCalledWith(tx, {
      orderId: zeroTotalOrder.id,
      actorUserId: studentUserId,
    });
  });

  it('does not accept a manual payment method for a zero-total order', async () => {
    const { service, tx, fulfilment } = build();

    await expect(
      service.checkout(
        studentUserId,
        { manualPaymentMethodId: 'method-1' },
        'zero-total-method-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.order.create).not.toHaveBeenCalled();
    expect(fulfilment.fulfil).not.toHaveBeenCalled();
  });

  it('returns an approved zero-total order on an idempotent retry without fulfilling again', async () => {
    const { service, prisma, tx, fulfilment } = build();
    prisma.commerceIdempotencyKey.findUnique.mockResolvedValue({
      resourceId: zeroTotalOrder.id,
    });

    await expect(
      service.checkout(studentUserId, {}, 'zero-total-retry-key'),
    ).resolves.toMatchObject({
      id: zeroTotalOrder.id,
      status: OrderStatus.APPROVED,
      paymentChannel: PaymentChannel.ZERO_TOTAL,
    });

    expect(tx.order.create).not.toHaveBeenCalled();
    expect(fulfilment.fulfil).not.toHaveBeenCalled();
  });
});

describe('CommerceService product eligibility', () => {
  it('treats a FREE course as a zero-total cart target even without legacy pricing', async () => {
    const prisma: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'course-free',
          title: 'Free course',
          accessType: 'FREE',
          isPurchasable: false,
          priceMinor: null,
          currency: null,
        }),
      },
    };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
    );

    await expect(
      (service as any).target('student-1', {
        targetType: 'COURSE',
        targetId: 'course-free',
      }),
    ).resolves.toEqual({
      targetType: 'COURSE',
      courseId: 'course-free',
      title: 'Free course',
      basePriceMinor: 0,
      currency: 'EGP',
      courseForCoverage: 'course-free',
    });
  });

  it('rejects an inherited chapter even when its course has a valid price', async () => {
    const prisma: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      chapter: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'chapter-1',
          title: 'Included chapter',
          courseId: 'course-1',
          accessType: 'INHERIT',
          isPurchasable: null,
          course: {
            id: 'course-1',
            isPurchasable: true,
            priceMinor: 20_000,
            currency: 'EGP',
          },
        }),
      },
    };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
    );

    await expect(
      (service as any).target('student-1', {
        targetType: 'CHAPTER',
        targetId: 'chapter-1',
      }),
    ).rejects.toThrow('not sold separately');
  });
});

describe('CommerceService stale cart cleanup', () => {
  const studentUserId = 'student-1';

  function quoteFor(targets: any[]) {
    return {
      items: targets.map((target) => ({
        ...target,
        finalPriceMinor: target.basePriceMinor,
        discountMinor: 0,
        promotionSnapshot: null,
      })),
      subtotalMinor: targets.reduce(
        (total, target) => total + target.basePriceMinor,
        0,
      ),
      discountMinor: 0,
      totalMinor: targets.reduce(
        (total, target) => total + target.basePriceMinor,
        0,
      ),
    };
  }

  it('removes only unavailable historical entries when loading a cart', async () => {
    const stale = {
      id: 'cart-item-stale',
      targetType: 'COURSE',
      courseId: 'course-archived',
      chapterId: null,
    };
    const valid = {
      id: 'cart-item-valid',
      targetType: 'CHAPTER',
      courseId: null,
      chapterId: 'chapter-valid',
    };
    const prisma: any = {
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          items: [stale, valid],
        }),
      },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: { findFirst: jest.fn().mockResolvedValue(null) },
      chapter: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'chapter-valid',
          title: 'Available chapter',
          courseId: 'course-1',
          accessType: 'EXPLICIT',
          isPurchasable: true,
          priceMinor: 12_000,
          currency: 'EGP',
          course: { id: 'course-1' },
        }),
      },
    };
    const pricing = { quote: jest.fn((targets) => quoteFor(targets)) };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
      pricing as any,
    );

    await expect(service.cart(studentUserId)).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: valid.id, targetId: valid.chapterId }),
      ],
      total: { amountMinor: 12_000, currency: 'EGP' },
    });
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', id: { in: [stale.id] } },
    });
    expect(pricing.quote).toHaveBeenCalledWith([
      expect.objectContaining({ chapterId: valid.chapterId }),
    ]);
  });

  it('cleans stale entries before checking a new cart item for overlap', async () => {
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(prisma)),
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            where.id === 'course-new'
              ? {
                  id: 'course-new',
                  title: 'New course',
                  isPurchasable: true,
                  priceMinor: 20_000,
                  currency: 'EGP',
                }
              : null,
          ),
        ),
      },
      studentEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          items: [
            {
              id: 'cart-item-stale',
              targetType: 'COURSE',
              courseId: 'course-archived',
              chapterId: null,
            },
          ],
        }),
      },
      cartItem: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 'cart-item-new',
          targetType: 'COURSE',
          courseId: 'course-new',
          chapterId: null,
        }),
      },
    };
    const pricing = { quote: jest.fn((targets) => quoteFor(targets)) };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
      pricing as any,
    );

    await expect(
      service.addCartItem(studentUserId, {
        targetType: 'COURSE' as any,
        targetId: 'course-new',
      }),
    ).resolves.toMatchObject({ targetId: 'course-new' });
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', id: { in: ['cart-item-stale'] } },
    });
    expect(prisma.cartItem.create).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('revalidates availability inside the serializable cart mutation', async () => {
    let archived = false;
    const tx: any = {
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: {
        findFirst: jest.fn(() =>
          Promise.resolve(
            archived
              ? null
              : {
                  id: 'course-1',
                  title: 'Course',
                  isPurchasable: true,
                  priceMinor: 20_000,
                  currency: 'EGP',
                },
          ),
        ),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => {
        // Model an archive committing after the request begins but before its
        // serializable mutation validates the target.
        archived = true;
        return callback(tx);
      }),
      studentProfile: { findUnique: jest.fn() },
      course: { findFirst: jest.fn() },
    };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
      { quote: jest.fn() } as any,
    );

    await expect(
      service.addCartItem(studentUserId, {
        targetType: 'COURSE' as any,
        targetId: 'course-1',
      }),
    ).rejects.toThrow('Purchasable course not found');
    expect(tx.course.findFirst).toHaveBeenCalled();
    expect(prisma.course.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('makes a cart containing only stale items empty at checkout', async () => {
    const prisma: any = {
      commerceIdempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      manualPaymentMethod: {
        findFirst: jest.fn().mockResolvedValue({ id: 'method-1' }),
      },
      cart: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          items: [
            {
              id: 'cart-item-stale',
              targetType: 'COURSE',
              courseId: 'course-archived',
              chapterId: null,
            },
          ],
        }),
      },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      studentProfile: {
        findUnique: jest.fn().mockResolvedValue({ academicGradeId: 'grade-1' }),
      },
      course: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new CommerceService(
      prisma,
      {} as any,
      { record: jest.fn(), recordWithClient: jest.fn() } as any,
      { quote: jest.fn() } as any,
    );

    await expect(
      service.checkout(
        studentUserId,
        { manualPaymentMethodId: 'method-1' },
        'checkout-key',
      ),
    ).rejects.toThrow('Cart is empty');
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { cartId: 'cart-1', id: { in: ['cart-item-stale'] } },
    });
    expect(prisma.$transaction).toBeUndefined();
  });
});

describe('CommerceService coupon priority', () => {
  const admin = { id: 'admin-1', role: Role.ADMIN } as any;
  const startsAt = new Date('2026-09-01T00:00:00.000Z');
  const endsAt = new Date('2026-10-01T00:00:00.000Z');

  function build() {
    const prisma: any = {
      coupon: {
        create: jest.fn().mockResolvedValue({ id: 'coupon-1', targets: [] }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'coupon-1',
          code: 'EXAM',
          name: 'Exam',
          kind: 'PERCENTAGE',
          amount: 1000,
          startsAt,
          endsAt,
          priority: 0,
          appliesToAll: true,
          targets: [],
        }),
        update: jest.fn().mockResolvedValue({ id: 'coupon-1', targets: [] }),
      },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    const audit = { record: jest.fn() };
    return {
      prisma,
      service: new CommerceService(prisma, {} as any, audit as any),
    };
  }

  it('stores an explicit coupon priority and defaults an omitted priority to zero', async () => {
    const { prisma, service } = build();

    await service.createCoupon(admin, {
      code: 'exam',
      name: 'Exam',
      kind: 'PERCENTAGE',
      amount: 1000,
      startsAt,
      endsAt,
      appliesToAll: true,
      priority: 7,
    });

    expect(prisma.coupon.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 7 }),
      }),
    );

    await service.createCoupon(admin, {
      code: 'exam-zero',
      name: 'Exam zero',
      kind: 'PERCENTAGE',
      amount: 1000,
      startsAt,
      endsAt,
      appliesToAll: true,
    });

    expect(prisma.coupon.create.mock.calls[1][0].data.priority).toBe(0);
  });

  it('updates coupon priority without changing the existing targets', async () => {
    const { prisma, service } = build();

    await service.updateCoupon(admin, 'coupon-1', { priority: 12 });

    expect(prisma.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 12 }),
      }),
    );
  });
});

describe('CommerceService referral review rules', () => {
  const program = {
    id: 'program-1',
    partnerUserId: 'partner-1',
    status: 'ACTIVE',
    startsAt: new Date('2026-01-01'),
    endsAt: null,
    appliesToAll: true,
    usageLimit: null,
    perStudentUsageLimit: null,
    rules: [
      {
        id: 'commission-1',
        version: 1,
        kind: 'PERCENTAGE',
        percentageBps: 1000,
        fixedCommissionMinor: null,
        maximumCommissionMinor: null,
        currency: 'EGP',
      },
    ],
    reviewRules: [
      {
        id: 'review-1',
        kind: ReferralReviewRuleKind.STUDENT_CODE_APPROVED_SALES,
        action: ReferralReviewAction.QUEUE_REVIEW,
        threshold: 2,
      },
    ],
  };
  function build() {
    const prisma: any = {
      referralCode: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          code: 'PARTNER',
          isActive: true,
          startsAt: null,
          endsAt: null,
          usageLimit: null,
          perStudentUsageLimit: null,
          programId: program.id,
          program,
        }),
      },
      orderReferralAttribution: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new CommerceService(
      prisma,
      {} as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      {
        get: jest.fn().mockReturnValue({
          referralsEnabled: true,
          referralAllowedStudentIds: [],
          partnerLedgerEnabled: false,
          partnerLedgerAllowedUserIds: [],
          reportExportsEnabled: false,
        }),
      } as any,
    );
    return { prisma, service };
  }
  it('queues a review flag without blocking checkout when a queue rule threshold is reached', async () => {
    const { service } = build();
    const referral = await (service as any).resolveReferral(
      'partner',
      'student-1',
      [{ courseForCoverage: 'course-1' }],
    );
    expect(referral.reviewFlags).toEqual([
      expect.objectContaining({
        ruleId: 'review-1',
        observedValue: 2,
        threshold: 2,
        action: ReferralReviewAction.QUEUE_REVIEW,
      }),
    ]);
  });
  it('blocks checkout when a configured rule is a hard block', async () => {
    const { service } = build();
    program.reviewRules[0] = {
      ...program.reviewRules[0],
      action: ReferralReviewAction.BLOCK_CHECKOUT,
    } as any;
    await expect(
      (service as any).resolveReferral('partner', 'student-1', [
        { courseForCoverage: 'course-1' },
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
    program.reviewRules[0] = {
      ...program.reviewRules[0],
      action: ReferralReviewAction.QUEUE_REVIEW,
    };
  });
});
