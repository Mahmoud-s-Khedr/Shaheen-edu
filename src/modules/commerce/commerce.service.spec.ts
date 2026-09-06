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

describe('CommerceService chapter product eligibility', () => {
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
