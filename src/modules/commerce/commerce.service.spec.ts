import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AssetKind,
  AssetStatus,
  ManualPaymentSubmissionStatus,
  OrderStatus,
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

  it('moves payment-method positions aside before assigning final unique positions', async () => {
    const { service } = build();
    const prisma: any = (service as any).prisma;
    const update = jest.fn().mockResolvedValue(undefined);
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      manualPaymentMethod: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
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
      -1, -2, 1, 2,
    ]);
  });
});
