import { ConflictException } from '@nestjs/common';
import { PartnerAllocationState, Role } from '../../common/types/roles.enum';
import { PartnerFinanceService } from './partner-finance.service';

const actor = { id: 'admin-1', role: Role.ADMIN } as any;

describe('PartnerFinanceService settlements', () => {
  function build() {
    const tx: any = {
      partnerAllocation: { findMany: jest.fn(), updateMany: jest.fn() },
      partnerSettlementLine: { count: jest.fn() },
      partnerSettlement: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    return {
      tx,
      service: new PartnerFinanceService(prisma, { record: jest.fn() } as any),
    };
  }

  it('creates a settlement only from one partner’s payable allocations', async () => {
    const { tx, service } = build();
    tx.partnerAllocation.findMany.mockResolvedValue([
      {
        id: 'a-1',
        partnerUserId: 'partner-1',
        currency: 'EGP',
        state: PartnerAllocationState.PAYABLE,
        amountMinor: 300,
      },
    ]);
    tx.partnerSettlementLine.count.mockResolvedValue(0);
    tx.partnerSettlement.create.mockResolvedValue({
      id: 'settlement-1',
      partnerUserId: 'partner-1',
      totalMinor: 300,
      lines: [{ allocationId: 'a-1' }],
    });
    await expect(
      service.createSettlement(actor, {
        allocationIds: ['a-1'],
        paymentReference: 'PAY-1',
      }),
    ).resolves.toMatchObject({ totalMinor: 300 });
  });

  it('does not mark a settlement paid when a line was reversed concurrently', async () => {
    const { tx, service } = build();
    tx.partnerSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      paidAt: null,
      lines: [{ allocationId: 'a-1' }],
    });
    tx.partnerAllocation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.markSettlementPaid(actor, 'settlement-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.partnerSettlement.update).not.toHaveBeenCalled();
  });
});

describe('PartnerFinanceService reconciliation evidence', () => {
  function build(run: any, paymobEvents: any[] = []) {
    const tx: any = {
      partnerFinanceDiscrepancy: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      partnerFinanceReconciliationRun: { update: jest.fn() },
    };
    tx.partnerFinanceReconciliationRun.update.mockImplementation(
      ({ data }: any) => ({
        id: run.id,
        ...data,
        orders: run.orders,
        discrepancies: [],
      }),
    );
    const prisma: any = {
      partnerFinanceReconciliationRun: {
        findUnique: jest.fn().mockResolvedValue(run),
        update: jest.fn(),
      },
      paymobWebhookEvent: {
        findMany: jest.fn().mockResolvedValue(paymobEvents),
      },
      publisherAgreement: { findMany: jest.fn().mockResolvedValue([]) },
      partnerSettlementLine: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    return {
      prisma,
      tx,
      service: new PartnerFinanceService(prisma, { record: jest.fn() } as any),
    };
  }

  it('records missing Paymob callback and receipt evidence as discrepancies', async () => {
    const run = {
      id: 'run-1',
      status: 'DRAFT',
      orders: [
        {
          orderId: 'order-1',
          order: {
            id: 'order-1',
            status: 'APPROVED',
            approvedAt: new Date(),
            totalMinor: 10_000,
            currency: 'EGP',
            paymentChannel: 'PAYMOB',
            receipt: null,
            referralAttribution: null,
            submissions: [],
            refundRequests: [],
            items: [],
            paymentAttempts: [
              {
                id: 'attempt-1',
                status: 'PAID',
                merchantReference: 'order-1:1',
                providerTransactionId: 'transaction-1',
              },
            ],
          },
        },
      ],
    };
    const { service, tx } = build(run);

    await service.runReconciliation(actor, 'run-1');

    expect(tx.partnerFinanceDiscrepancy.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: 'MISSING_RECEIPT' }),
          expect.objectContaining({ type: 'PAYMOB_RECEIPT_ATTEMPT_MISMATCH' }),
          expect.objectContaining({ type: 'MISSING_VERIFIED_PAYMOB_CALLBACK' }),
        ]),
      }),
    );
  });

  it('does not revoke or reverse an unrefunded item in a partial-order refund', async () => {
    const run = {
      id: 'run-2',
      status: 'DRAFT',
      orders: [
        {
          orderId: 'order-2',
          order: {
            id: 'order-2',
            status: 'APPROVED',
            approvedAt: new Date(),
            totalMinor: 10_000,
            currency: 'EGP',
            paymentChannel: 'MANUAL',
            referralAttribution: null,
            receipt: {
              paymentAttemptId: null,
              snapshot: {
                orderId: 'order-2',
                totalMinor: 10_000,
                currency: 'EGP',
              },
            },
            submissions: [{ id: 'submission-1', status: 'APPROVED' }],
            paymentAttempts: [],
            refundRequests: [
              {
                id: 'refund-1',
                manualRefundReference: 'BANK-1',
                items: [{ orderItemId: 'item-1' }],
              },
            ],
            items: [
              {
                id: 'item-1',
                courseId: 'course-1',
                chapterId: null,
                priceMinor: 5_000,
                currency: 'EGP',
                chapter: null,
                entitlement: { status: 'REVOKED' },
                allocations: [],
              },
              {
                id: 'item-2',
                courseId: 'course-2',
                chapterId: null,
                priceMinor: 5_000,
                currency: 'EGP',
                chapter: null,
                entitlement: { status: 'ACTIVE' },
                allocations: [],
              },
            ],
          },
        },
      ],
    };
    const { service, tx } = build(run);

    await service.runReconciliation(actor, 'run-2');

    expect(tx.partnerFinanceDiscrepancy.createMany).not.toHaveBeenCalled();
  });
});
