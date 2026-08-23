/* eslint-disable no-console */
import { OrderStatus, PartnerAllocationKind, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const from = process.argv.find((value) => value.startsWith('--from='))?.slice(7);
const to = process.argv.find((value) => value.startsWith('--to='))?.slice(5);
const dateRange = {
  ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
  ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
};

async function main() {
  if ((from && Number.isNaN(new Date(`${from}T00:00:00.000Z`).valueOf())) || (to && Number.isNaN(new Date(`${to}T23:59:59.999Z`).valueOf()))) throw new Error('Use YYYY-MM-DD for --from and --to');
  const [allocations, approvedItems] = await Promise.all([
    prisma.partnerAllocation.findMany({ where: Object.keys(dateRange).length ? { createdAt: dateRange } : {}, include: { orderItem: { include: { order: { select: { id: true, status: true, approvedAt: true, receipt: true, refundRequests: { where: { status: 'APPROVED' }, select: { id: true } } } }, entitlement: true, allocations: { select: { id: true, amountMinor: true, reversedAllocationId: true, state: true } } } } } }),
    prisma.orderItem.findMany({ where: { order: { status: OrderStatus.APPROVED, ...(Object.keys(dateRange).length ? { approvedAt: dateRange } : {}) } }, include: { entitlement: true, order: { select: { receipt: true } }, allocations: { select: { id: true, kind: true, amountMinor: true, state: true } } } }),
  ]);
  const issues = allocations.flatMap((allocation) => {
    const item = allocation.orderItem; const reasons: string[] = [];
    if (item.order.status !== OrderStatus.APPROVED) reasons.push('allocation_order_not_approved');
    if (allocation.currency !== item.currency) reasons.push('currency_mismatch');
    const isCompensating = allocation.amountMinor < 0;
    if (allocation.state !== 'REVERSED' && allocation.basisMinor !== (isCompensating ? -item.priceMinor : item.priceMinor)) reasons.push('basis_does_not_match_final_item_price');
    if (allocation.state !== 'REVERSED' && (allocation.amountMinor === 0 || Math.abs(allocation.amountMinor) > item.priceMinor)) reasons.push('invalid_allocation_amount');
    if (allocation.kind === PartnerAllocationKind.PUBLISHER_SALE && !allocation.publisherAgreementId) reasons.push('publisher_allocation_without_agreement');
    if (allocation.kind === PartnerAllocationKind.REFERRAL_COMMISSION && !allocation.referralRuleId) reasons.push('referral_allocation_without_rule');
    if (allocation.state === 'REVERSED' && !item.allocations.some((row) => row.reversedAllocationId === allocation.id && row.amountMinor === -Math.abs(allocation.amountMinor))) reasons.push('reversed_original_without_compensating_row');
    if (item.order.refundRequests.length && allocation.amountMinor > 0 && allocation.state !== 'REVERSED') reasons.push('approved_refund_without_reversed_original');
    return reasons.length ? [{ allocationId: allocation.id, orderId: item.order.id, orderItemId: item.id, reasons }] : [];
  });
  const unallocatedApprovedItems = approvedItems.filter((item) => item.allocations.length === 0).map((item) => item.id);
  const lifecycle = { approvedItemsWithoutReceipt: approvedItems.filter((item) => !item.order.receipt).map((item) => item.id), approvedItemsWithoutEntitlement: approvedItems.filter((item) => !item.entitlement).map((item) => item.id) };
  console.log(JSON.stringify({ mode: 'read-only', period: { from: from ?? null, to: to ?? null }, allocationsScanned: allocations.length, approvedOrderItemsScanned: approvedItems.length, issues: { count: issues.length, sample: issues.slice(0, 100) }, lifecycle, coverage: { approvedItemsWithoutPartnerAllocation: unallocatedApprovedItems.length, sample: unallocatedApprovedItems.slice(0, 100), note: 'These are candidates for review, not automatic errors: an item may have no publisher agreement and no referral.' } }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
