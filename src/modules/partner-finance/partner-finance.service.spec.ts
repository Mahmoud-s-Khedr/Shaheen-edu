import { ConflictException } from '@nestjs/common';
import { PartnerAllocationState, Role } from '../../common/types/roles.enum';
import { PartnerFinanceService } from './partner-finance.service';

const actor = { id: 'admin-1', role: Role.ADMIN } as any;

describe('PartnerFinanceService settlements', () => {
  function build() {
    const tx: any = {
      partnerAllocation: { findMany: jest.fn(), updateMany: jest.fn() },
      partnerSettlementLine: { count: jest.fn() },
      partnerSettlement: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    return { tx, service: new PartnerFinanceService(prisma, { record: jest.fn() } as any) };
  }

  it('creates a settlement only from one partner’s payable allocations', async () => {
    const { tx, service } = build();
    tx.partnerAllocation.findMany.mockResolvedValue([{ id: 'a-1', partnerUserId: 'partner-1', currency: 'EGP', state: PartnerAllocationState.PAYABLE, amountMinor: 300 }]);
    tx.partnerSettlementLine.count.mockResolvedValue(0);
    tx.partnerSettlement.create.mockResolvedValue({ id: 'settlement-1', partnerUserId: 'partner-1', totalMinor: 300, lines: [{ allocationId: 'a-1' }] });
    await expect(service.createSettlement(actor, { allocationIds: ['a-1'], paymentReference: 'PAY-1' })).resolves.toMatchObject({ totalMinor: 300 });
  });

  it('does not mark a settlement paid when a line was reversed concurrently', async () => {
    const { tx, service } = build();
    tx.partnerSettlement.findUnique.mockResolvedValue({ id: 'settlement-1', paidAt: null, lines: [{ allocationId: 'a-1' }] });
    tx.partnerAllocation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.markSettlementPaid(actor, 'settlement-1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.partnerSettlement.update).not.toHaveBeenCalled();
  });
});
