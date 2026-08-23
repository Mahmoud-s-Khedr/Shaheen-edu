import { RefundRequestStatus, Role } from '../../common/types/roles.enum';
import { RefundsService } from './refunds.service';

describe('RefundsService', () => {
  const studentUserId = 'student-1';
  const actor = { id: 'admin-1', role: Role.ADMIN } as any;

  function build(policy = { eligibilityWindowDays: 7, maximumConsumptionBps: 1_000 }) {
    const tx: any = {
      order: { findFirst: jest.fn() },
      contentItem: { count: jest.fn() },
      studentContentProgress: { count: jest.fn() },
      refundRequest: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
      studentEntitlement: { updateMany: jest.fn() },
      partnerAllocation: { create: jest.fn(), updateMany: jest.fn() },
      refundPolicy: { findFirst: jest.fn().mockResolvedValue({ id: 'policy-1', version: 1, ...policy }) },
    };
    const prisma: any = { $transaction: jest.fn((callback: any) => callback(tx)) };
    const audit = { record: jest.fn() };
    return { tx, audit, service: new RefundsService(prisma, audit as any) };
  }

  const approvedOrder = {
    id: 'order-1',
    approvedAt: new Date(Date.now() - 60_000),
    items: [{ id: 'item-1', targetType: 'COURSE', courseId: 'course-1', chapterId: null, priceMinor: 12000, currency: 'EGP', refundRequestItem: null }],
  };

  it('keeps an eligible request pending for manual review', async () => {
    const { tx, service } = build();
    tx.order.findFirst.mockResolvedValue(approvedOrder);
    tx.contentItem.count.mockResolvedValue(10);
    tx.studentContentProgress.count.mockResolvedValue(0);
    tx.refundRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'refund-1', ...data, items: data.items.create.map((item: any) => ({ ...item, id: 'refund-item-1', orderItem: approvedOrder.items[0] })) }));

    const result = await service.request(studentUserId, approvedOrder.id, { reason: 'Purchased by mistake' });

    expect(result.status).toBe(RefundRequestStatus.PENDING);
    expect(tx.refundRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: RefundRequestStatus.PENDING }) }));
  });

  it('automatically rejects a request at the configured consumption threshold', async () => {
    const { tx, service } = build();
    tx.order.findFirst.mockResolvedValue(approvedOrder);
    tx.contentItem.count.mockResolvedValue(10);
    tx.studentContentProgress.count.mockResolvedValue(1);
    tx.refundRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'refund-1', ...data, items: data.items.create.map((item: any) => ({ ...item, id: 'refund-item-1', orderItem: approvedOrder.items[0] })) }));

    const result = await service.request(studentUserId, approvedOrder.id, { reason: 'Purchased by mistake' });

    expect(result.status).toBe(RefundRequestStatus.REJECTED);
    expect(result.rejectionReason).toContain('MAXIMUM_CONSUMPTION_REACHED');
  });

  it('automatically rejects a request after the configured refund window', async () => {
    const { tx, service } = build();
    tx.order.findFirst.mockResolvedValue({ ...approvedOrder, approvedAt: new Date(Date.now() - 8 * 86_400_000) });
    tx.contentItem.count.mockResolvedValue(10);
    tx.studentContentProgress.count.mockResolvedValue(0);
    tx.refundRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'refund-1', ...data, items: data.items.create.map((item: any) => ({ ...item, id: 'refund-item-1', orderItem: approvedOrder.items[0] })) }));

    const result = await service.request(studentUserId, approvedOrder.id, { reason: 'Purchased by mistake' });

    expect(result.status).toBe(RefundRequestStatus.REJECTED);
    expect(result.rejectionReason).toContain('REFUND_WINDOW_EXPIRED');
  });

  it('approval revokes the purchased entitlement and appends a payable negative allocation', async () => {
    const { tx, service } = build();
    const request = {
      id: 'refund-1', orderId: 'order-1', studentUserId,
      items: [{ orderItemId: 'item-1', orderItem: { allocations: [{ id: 'allocation-1', kind: 'PUBLISHER_SALE', partnerUserId: 'partner-1', orderItemId: 'item-1', publisherAgreementId: 'agreement-1', referralRuleId: null, basisMinor: 12000, amountMinor: 2400, currency: 'EGP', snapshot: { version: 1 }, state: 'PAID' }] } }],
    };
    tx.refundRequest.findUnique.mockResolvedValue(request);
    tx.refundRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.studentEntitlement.updateMany.mockResolvedValue({ count: 1 });
    tx.partnerAllocation.create.mockResolvedValue({ id: 'reversal-1' });
    tx.partnerAllocation.updateMany.mockResolvedValue({ count: 1 });
    tx.refundRequest.findUniqueOrThrow.mockResolvedValue({ ...request, status: RefundRequestStatus.APPROVED, manualRefundReference: 'WHATSAPP-REF-1', items: [{ id: 'refund-item-1', orderItemId: 'item-1', amountMinor: 12000, currency: 'EGP', orderItem: { targetType: 'COURSE', courseId: 'course-1', chapterId: null, titleSnapshot: 'Course' } }] });

    await service.approve(actor, request.id, { manualRefundReference: 'WHATSAPP-REF-1' });

    expect(tx.studentEntitlement.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ orderItemId: { in: ['item-1'] } }) }));
    expect(tx.partnerAllocation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountMinor: -2400, basisMinor: -12000, state: 'PAYABLE', reversedAllocationId: 'allocation-1' }) }));
    expect(tx.partnerAllocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'REVERSED' }) }));
  });
});
