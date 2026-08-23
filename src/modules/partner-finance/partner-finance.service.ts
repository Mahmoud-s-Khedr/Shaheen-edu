import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ManualPaymentSubmissionStatus,
  PartnerAllocationState,
  PaymentAttemptStatus,
  PaymentChannel,
  Role,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublisherUsageRollupsService } from '../partner-analytics/publisher-usage-rollups.service';
import type {
  AdminAllocationsQueryDto,
  AssignReconciliationDiscrepancyDto,
  CreateReconciliationRunDto,
  CreateSettlementDto,
  RebuildPublisherUsageRollupsDto,
  ReconciliationDiscrepanciesQueryDto,
  ReconciliationRunsQueryDto,
  ResolveReconciliationDiscrepancyDto,
  SettlementsQueryDto,
} from './dto/partner-finance.dto';

@Injectable()
export class PartnerFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly usageRollups: PublisherUsageRollupsService,
  ) {}
  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const start = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const end = to ? new Date(`${to}T23:59:59.999Z`) : undefined;
    if (
      (start && Number.isNaN(start.valueOf())) ||
      (end && Number.isNaN(end.valueOf())) ||
      (start && end && end < start)
    )
      throw new BadRequestException('Invalid date range');
    return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  }
  async allocations(actor: RequestUser, query: AdminAllocationsQueryDto) {
    this.admin(actor);
    const createdAt = this.dateRange(query.from, query.to);
    const where = {
      ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.publisherAgreementId
        ? { publisherAgreementId: query.publisherAgreementId }
        : {}),
      ...(query.referralRuleId ? { referralRuleId: query.referralRuleId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerAllocation.findMany({
        where,
        include: {
          partner: { select: { displayName: true } },
          publisherAgreement: {
            select: { contractReference: true, version: true },
          },
          referralRule: { select: { programId: true, version: true } },
          settlementLines: { select: { settlementId: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.partnerAllocation.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async createSettlement(actor: RequestUser, dto: CreateSettlementDto) {
    this.admin(actor);
    const ids = [...new Set(dto.allocationIds)];
    if (ids.length !== dto.allocationIds.length)
      throw new BadRequestException(
        'Each allocation can be selected only once',
      );
    const settlement = await this.prisma.$transaction(
      async (tx) => {
        const allocations = await tx.partnerAllocation.findMany({
          where: { id: { in: ids } },
        });
        if (allocations.length !== ids.length)
          throw new NotFoundException('One or more allocations were not found');
        const [first] = allocations;
        if (
          !allocations.every(
            (row) =>
              row.partnerUserId === first.partnerUserId &&
              row.currency === first.currency &&
              row.state === PartnerAllocationState.PAYABLE,
          )
        )
          throw new BadRequestException(
            'A settlement requires payable allocations for one partner and currency',
          );
        const assigned = await tx.partnerSettlementLine.count({
          where: { allocationId: { in: ids } },
        });
        if (assigned)
          throw new ConflictException(
            'One or more allocations are already in a settlement',
          );
        const totalMinor = allocations.reduce(
          (sum, row) => sum + row.amountMinor,
          0,
        );
        if (totalMinor === 0)
          throw new BadRequestException('A settlement total cannot be zero');
        return tx.partnerSettlement.create({
          data: {
            partnerUserId: first.partnerUserId,
            paymentReference: dto.paymentReference.trim(),
            currency: first.currency,
            totalMinor,
            createdById: actor.id,
            lines: { create: ids.map((allocationId) => ({ allocationId })) },
          },
          include: { lines: { include: { allocation: true } } },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_SETTLEMENT_CREATED',
      targetType: 'PartnerSettlement',
      targetId: settlement.id,
      metadata: {
        partnerUserId: settlement.partnerUserId,
        allocationCount: settlement.lines.length,
        totalMinor: settlement.totalMinor,
      },
    });
    return settlement;
  }
  async markSettlementPaid(actor: RequestUser, id: string) {
    this.admin(actor);
    const now = new Date();
    const settlement = await this.prisma.$transaction(
      async (tx) => {
        const found = await tx.partnerSettlement.findUnique({
          where: { id },
          include: { lines: true },
        });
        if (!found) throw new NotFoundException('Partner settlement not found');
        if (found.paidAt)
          throw new ConflictException('Settlement is already marked paid');
        const updated = await tx.partnerAllocation.updateMany({
          where: {
            id: { in: found.lines.map((line) => line.allocationId) },
            state: PartnerAllocationState.PAYABLE,
          },
          data: { state: PartnerAllocationState.PAID, paidAt: now },
        });
        if (updated.count !== found.lines.length)
          throw new ConflictException(
            'A settlement allocation is no longer payable',
          );
        return tx.partnerSettlement.update({
          where: { id },
          data: { paidAt: now },
          include: { lines: { include: { allocation: true } } },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_SETTLEMENT_PAID',
      targetType: 'PartnerSettlement',
      targetId: id,
      metadata: { paidAt: now.toISOString() },
    });
    return settlement;
  }
  async settlements(actor: RequestUser, query: SettlementsQueryDto) {
    this.admin(actor);
    const createdAt = this.dateRange(query.from, query.to);
    const where = {
      ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}),
      ...(query.kind
        ? { lines: { some: { allocation: { kind: query.kind } } } }
        : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerSettlement.findMany({
        where,
        include: {
          partner: { select: { displayName: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.partnerSettlement.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }

  async rebuildUsageRollups(
    actor: RequestUser,
    dto: RebuildPublisherUsageRollupsDto,
  ) {
    this.admin(actor);
    const from = new Date(`${dto.from}T00:00:00.000Z`);
    const to = new Date(`${dto.to}T00:00:00.000Z`);
    if (
      Number.isNaN(from.valueOf()) ||
      Number.isNaN(to.valueOf()) ||
      to < from ||
      (to.valueOf() - from.valueOf()) / 86_400_000 > 366
    ) {
      throw new BadRequestException(
        'Usage-rollup rebuilds must cover an inclusive range of at most 367 days',
      );
    }
    const result = await this.usageRollups.rebuild(dto);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PUBLISHER_USAGE_ROLLUPS_REBUILT',
      targetType: 'PublisherUsageDailyRollup',
      targetId: dto.publisherUserId ?? 'ALL_PUBLISHERS',
      metadata: result,
    });
    return result;
  }

  async createReconciliationRun(
    actor: RequestUser,
    dto: CreateReconciliationRunDto,
  ) {
    this.admin(actor);
    const orderIds = [...new Set(dto.orderIds)];
    if (orderIds.length !== dto.orderIds.length)
      throw new BadRequestException(
        'Each approved order can be selected only once',
      );
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, status: 'APPROVED' },
      select: { id: true },
    });
    if (orders.length !== orderIds.length)
      throw new BadRequestException(
        'Reconciliation runs require explicitly selected approved orders',
      );
    const run = await this.prisma.partnerFinanceReconciliationRun.create({
      data: {
        pilotLabel: dto.pilotLabel.trim(),
        createdById: actor.id,
        orders: { create: orderIds.map((orderId) => ({ orderId })) },
      },
      include: { orders: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_FINANCE_RECONCILIATION_CREATED',
      targetType: 'PartnerFinanceReconciliationRun',
      targetId: run.id,
      metadata: { pilotLabel: run.pilotLabel, orderIds },
    });
    return run;
  }

  private publisherExpected(item: any, agreements: any[]) {
    const candidates = item.chapterId
      ? [{ chapterId: item.chapterId }, { courseId: item.chapter?.courseId }]
      : [{ courseId: item.courseId }];
    const agreement = agreements.find((row) =>
      candidates.some((target) =>
        Object.entries(target).every(
          ([key, value]) => value && row[key] === value,
        ),
      ),
    );
    if (!agreement) return null;
    const amount =
      agreement.payoutKind === 'PERCENTAGE'
        ? Math.floor(
            (item.priceMinor * (agreement.revenueShareBps ?? 0)) / 10_000,
          )
        : (agreement.fixedPayoutMinor ?? 0);
    return amount > 0 && amount <= item.priceMinor
      ? {
          kind: 'PUBLISHER_SALE',
          partnerUserId: agreement.publisherUserId,
          sourceId: agreement.id,
          basisMinor: item.priceMinor,
          amountMinor: amount,
          currency: item.currency,
        }
      : null;
  }

  private referralExpected(item: any, attribution: any) {
    if (!attribution) return null;
    const terms = attribution.snapshot as any;
    const amount =
      terms.kind === 'FIXED_PER_SALE'
        ? (terms.fixedCommissionMinor ?? 0)
        : terms.kind === 'PERCENTAGE_CAPPED'
          ? Math.min(
              Math.floor(
                (item.priceMinor * (terms.percentageBps ?? 0)) / 10_000,
              ),
              terms.maximumCommissionMinor ?? 0,
            )
          : Math.floor((item.priceMinor * (terms.percentageBps ?? 0)) / 10_000);
    return amount > 0 && amount <= item.priceMinor && terms.partnerUserId
      ? {
          kind: 'REFERRAL_COMMISSION',
          partnerUserId: terms.partnerUserId,
          sourceId: attribution.ruleId,
          basisMinor: item.priceMinor,
          amountMinor: amount,
          currency: item.currency,
        }
      : null;
  }

  private discrepancy(input: any) {
    return { severity: 'ERROR', ...input };
  }

  async runReconciliation(actor: RequestUser, id: string) {
    this.admin(actor);
    const now = new Date();
    const run = await this.prisma.partnerFinanceReconciliationRun.findUnique({
      where: { id },
      include: {
        orders: {
          include: {
            order: {
              include: {
                receipt: true,
                referralAttribution: true,
                submissions: { select: { id: true, status: true } },
                paymentAttempts: {
                  select: {
                    id: true,
                    status: true,
                    merchantReference: true,
                    providerTransactionId: true,
                  },
                },
                refundRequests: {
                  where: { status: 'APPROVED' },
                  select: {
                    id: true,
                    manualRefundReference: true,
                    items: { select: { orderItemId: true } },
                  },
                },
                items: {
                  include: {
                    chapter: { select: { courseId: true } },
                    entitlement: true,
                    allocations: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Reconciliation run not found');
    if (run.status === 'RUNNING')
      throw new ConflictException('Reconciliation run is already running');
    await this.prisma.partnerFinanceReconciliationRun.update({
      where: { id },
      data: {
        status: 'RUNNING',
        startedAt: now,
        completedAt: null,
        summary: undefined,
      },
    });
    const orderIds = run.orders.map((row) => row.orderId);
    const paymobTransactionIds = run.orders.flatMap((row: any) =>
      row.order.paymentAttempts
        .map((attempt: any) => attempt.providerTransactionId)
        .filter((transactionId: string | null): transactionId is string =>
          Boolean(transactionId),
        ),
    );
    const paymobEvents = paymobTransactionIds.length
      ? await this.prisma.paymobWebhookEvent.findMany({
          where: { externalTransactionId: { in: paymobTransactionIds } },
          select: {
            externalTransactionId: true,
            merchantReference: true,
            verified: true,
            processedAt: true,
            processingError: true,
            payload: true,
          },
        })
      : [];
    const paymobEventByTransactionId = new Map(
      paymobEvents.map((event) => [event.externalTransactionId, event]),
    );
    const agreements = await this.prisma.publisherAgreement.findMany({
      where: {
        status: { in: ['ACTIVE', 'ENDED'] },
        isPrimary: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date(0) } }],
      },
    });
    const findings: any[] = [];
    for (const selected of run.orders) {
      const order: any = selected.order;
      if (order.status !== 'APPROVED' || !order.approvedAt) {
        findings.push(
          this.discrepancy({ type: 'ORDER_NOT_APPROVED', orderItemId: null }),
        );
        continue;
      }
      if (!order.receipt)
        findings.push(this.discrepancy({ type: 'MISSING_RECEIPT' }));
      if (order.receipt) {
        const receiptSnapshot = order.receipt.snapshot as any;
        if (
          receiptSnapshot?.orderId !== order.id ||
          receiptSnapshot?.totalMinor !== order.totalMinor ||
          receiptSnapshot?.currency !== order.currency
        ) {
          findings.push(
            this.discrepancy({
              type: 'RECEIPT_SNAPSHOT_MISMATCH',
              expectedAmountMinor: order.totalMinor,
              actualAmountMinor: receiptSnapshot?.totalMinor ?? null,
              currency: order.currency,
            }),
          );
        }
      }
      if (order.paymentChannel === PaymentChannel.MANUAL) {
        if (
          !order.submissions.some(
            (submission: any) =>
              submission.status === ManualPaymentSubmissionStatus.APPROVED,
          )
        )
          findings.push(
            this.discrepancy({
              type: 'MISSING_APPROVED_MANUAL_PAYMENT_SUBMISSION',
            }),
          );
        if (order.receipt?.paymentAttemptId)
          findings.push(
            this.discrepancy({ type: 'MANUAL_RECEIPT_HAS_PAYMENT_ATTEMPT' }),
          );
      }
      if (order.paymentChannel === PaymentChannel.PAYMOB) {
        const paidAttempts = order.paymentAttempts.filter(
          (attempt: any) => attempt.status === PaymentAttemptStatus.PAID,
        );
        if (paidAttempts.length !== 1)
          findings.push(
            this.discrepancy({
              type: paidAttempts.length
                ? 'MULTIPLE_PAID_PAYMOB_ATTEMPTS'
                : 'MISSING_PAID_PAYMOB_ATTEMPT',
            }),
          );
        const paidAttempt = paidAttempts[0];
        if (paidAttempt) {
          if (order.receipt?.paymentAttemptId !== paidAttempt.id)
            findings.push(
              this.discrepancy({ type: 'PAYMOB_RECEIPT_ATTEMPT_MISMATCH' }),
            );
          if (!paidAttempt.providerTransactionId)
            findings.push(
              this.discrepancy({
                type: 'MISSING_PAYMOB_PROVIDER_TRANSACTION_ID',
              }),
            );
          else {
            const event = paymobEventByTransactionId.get(
              paidAttempt.providerTransactionId,
            );
            if (!event)
              findings.push(
                this.discrepancy({ type: 'MISSING_VERIFIED_PAYMOB_CALLBACK' }),
              );
            else {
              const providerPayload = event.payload as any;
              if (
                !event.verified ||
                !event.processedAt ||
                event.processingError
              )
                findings.push(
                  this.discrepancy({ type: 'UNPROCESSED_PAYMOB_CALLBACK' }),
                );
              if (event.merchantReference !== paidAttempt.merchantReference)
                findings.push(
                  this.discrepancy({
                    type: 'PAYMOB_CALLBACK_REFERENCE_MISMATCH',
                  }),
                );
              if (Number(providerPayload?.amount_cents) !== order.totalMinor)
                findings.push(
                  this.discrepancy({
                    type: 'PAYMOB_CALLBACK_AMOUNT_MISMATCH',
                    expectedAmountMinor: order.totalMinor,
                    actualAmountMinor: Number.isFinite(
                      Number(providerPayload?.amount_cents),
                    )
                      ? Number(providerPayload.amount_cents)
                      : null,
                    currency: order.currency,
                  }),
                );
              if (providerPayload?.currency !== order.currency)
                findings.push(
                  this.discrepancy({
                    type: 'PAYMOB_CALLBACK_CURRENCY_MISMATCH',
                    currency: order.currency,
                  }),
                );
            }
          }
        }
      }
      const refundedItemIds = new Set(
        order.refundRequests.flatMap((request: any) =>
          request.items.map((item: any) => item.orderItemId),
        ),
      );
      for (const refund of order.refundRequests)
        if (!refund.manualRefundReference?.trim())
          findings.push(
            this.discrepancy({ type: 'MISSING_MANUAL_REFUND_REFERENCE' }),
          );
      for (const item of order.items) {
        const refunded = refundedItemIds.has(item.id);
        const expectedEntitlementStatus = refunded ? 'REVOKED' : 'ACTIVE';
        if (
          !item.entitlement ||
          item.entitlement.status !== expectedEntitlementStatus
        )
          findings.push(
            this.discrepancy({
              type: `ENTITLEMENT_${expectedEntitlementStatus}_MISMATCH`,
              orderItemId: item.id,
            }),
          );
        // Re-resolve historical agreement terms without reading any ledger row.
        const applicable = agreements.filter(
          (agreement: any) =>
            agreement.startsAt <= order.approvedAt &&
            (!agreement.endsAt || agreement.endsAt > order.approvedAt),
        );
        const expected = [
          this.publisherExpected(item, applicable),
          this.referralExpected(item, order.referralAttribution),
        ].filter(Boolean) as any[];
        for (const expectation of expected) {
          const matching = item.allocations.filter(
            (allocation: any) =>
              allocation.kind === expectation.kind &&
              allocation.partnerUserId === expectation.partnerUserId &&
              (expectation.kind === 'PUBLISHER_SALE'
                ? allocation.publisherAgreementId === expectation.sourceId
                : allocation.referralRuleId === expectation.sourceId) &&
              allocation.amountMinor > 0,
          );
          for (const allocation of item.allocations.filter(
            (row: any) =>
              row.kind === expectation.kind &&
              row.partnerUserId === expectation.partnerUserId &&
              row.amountMinor > 0 &&
              (expectation.kind === 'PUBLISHER_SALE'
                ? row.publisherAgreementId !== expectation.sourceId
                : row.referralRuleId !== expectation.sourceId),
          ))
            findings.push(
              this.discrepancy({
                type:
                  expectation.kind === 'PUBLISHER_SALE'
                    ? 'INCORRECT_PUBLISHER_AGREEMENT'
                    : 'INCORRECT_REFERRAL_RULE',
                orderItemId: item.id,
                allocationId: allocation.id,
                partnerUserId: allocation.partnerUserId,
                expectedAmountMinor: expectation.amountMinor,
                actualAmountMinor: allocation.amountMinor,
                expectedBasisMinor: expectation.basisMinor,
                actualBasisMinor: allocation.basisMinor,
                currency: allocation.currency,
              }),
            );
          if (!matching.length)
            findings.push(
              this.discrepancy({
                type: `MISSING_${expectation.kind}`,
                orderItemId: item.id,
                partnerUserId: expectation.partnerUserId,
                expectedAmountMinor: expectation.amountMinor,
                expectedBasisMinor: expectation.basisMinor,
                currency: expectation.currency,
              }),
            );
          if (matching.length > 1)
            for (const allocation of matching.slice(1))
              findings.push(
                this.discrepancy({
                  type: 'DUPLICATE_ALLOCATION',
                  orderItemId: item.id,
                  allocationId: allocation.id,
                  partnerUserId: allocation.partnerUserId,
                  actualAmountMinor: allocation.amountMinor,
                  actualBasisMinor: allocation.basisMinor,
                  currency: allocation.currency,
                }),
              );
          for (const allocation of matching.slice(0, 1)) {
            if (allocation.basisMinor !== expectation.basisMinor)
              findings.push(
                this.discrepancy({
                  type: 'INCORRECT_ALLOCATION_BASIS',
                  orderItemId: item.id,
                  allocationId: allocation.id,
                  partnerUserId: allocation.partnerUserId,
                  expectedBasisMinor: expectation.basisMinor,
                  actualBasisMinor: allocation.basisMinor,
                  currency: allocation.currency,
                }),
              );
            if (allocation.amountMinor !== expectation.amountMinor)
              findings.push(
                this.discrepancy({
                  type: 'INCORRECT_ALLOCATION_AMOUNT',
                  orderItemId: item.id,
                  allocationId: allocation.id,
                  partnerUserId: allocation.partnerUserId,
                  expectedAmountMinor: expectation.amountMinor,
                  actualAmountMinor: allocation.amountMinor,
                  currency: allocation.currency,
                }),
              );
            if (
              refunded &&
              (allocation.state !== PartnerAllocationState.REVERSED ||
                !item.allocations.some(
                  (candidate: any) =>
                    candidate.reversedAllocationId === allocation.id &&
                    candidate.amountMinor === -Math.abs(allocation.amountMinor),
                ))
            )
              findings.push(
                this.discrepancy({
                  type: 'MISSING_REFUND_REVERSAL',
                  orderItemId: item.id,
                  allocationId: allocation.id,
                  partnerUserId: allocation.partnerUserId,
                  expectedAmountMinor: -Math.abs(allocation.amountMinor),
                  currency: allocation.currency,
                }),
              );
          }
        }
        for (const allocation of item.allocations.filter(
          (row: any) =>
            row.amountMinor > 0 &&
            !expected.some(
              (expectation) =>
                expectation.kind === row.kind &&
                expectation.partnerUserId === row.partnerUserId,
            ),
        ))
          findings.push(
            this.discrepancy({
              type: 'UNEXPECTED_ALLOCATION',
              orderItemId: item.id,
              allocationId: allocation.id,
              partnerUserId: allocation.partnerUserId,
              actualAmountMinor: allocation.amountMinor,
              actualBasisMinor: allocation.basisMinor,
              currency: allocation.currency,
            }),
          );
      }
    }
    const settlementIssues = await this.prisma.partnerSettlementLine.findMany({
      where: { allocation: { orderItem: { orderId: { in: orderIds } } } },
      include: { allocation: true, settlement: true },
    });
    for (const line of settlementIssues)
      if (
        line.settlement.paidAt &&
        (line.allocation.state !== PartnerAllocationState.PAID ||
          line.allocation.paidAt === null)
      )
        findings.push(
          this.discrepancy({
            type: 'SETTLEMENT_STATE_MISMATCH',
            allocationId: line.allocationId,
            partnerUserId: line.allocation.partnerUserId,
            actualAmountMinor: line.allocation.amountMinor,
            currency: line.allocation.currency,
          }),
        );
    const completedAt = new Date();
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.partnerFinanceDiscrepancy.deleteMany({ where: { runId: id } });
      if (findings.length)
        await tx.partnerFinanceDiscrepancy.createMany({
          data: findings.map((finding) => ({ runId: id, ...finding })),
        });
      return tx.partnerFinanceReconciliationRun.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt,
          summary: {
            ordersScanned: orderIds.length,
            discrepancyCount: findings.length,
          },
        },
        include: { discrepancies: true, orders: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_FINANCE_RECONCILIATION_COMPLETED',
      targetType: 'PartnerFinanceReconciliationRun',
      targetId: id,
      metadata: saved.summary as any,
    });
    return saved;
  }

  async reconciliationRuns(
    actor: RequestUser,
    query: ReconciliationRunsQueryDto,
  ) {
    this.admin(actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerFinanceReconciliationRun.findMany({
        include: { _count: { select: { discrepancies: true, orders: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.partnerFinanceReconciliationRun.count(),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }

  async reconciliationRun(actor: RequestUser, id: string) {
    this.admin(actor);
    const run = await this.prisma.partnerFinanceReconciliationRun.findUnique({
      where: { id },
      include: {
        orders: true,
        discrepancies: {
          orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!run) throw new NotFoundException('Reconciliation run not found');
    return run;
  }
  async discrepancies(
    actor: RequestUser,
    id: string,
    query: ReconciliationDiscrepanciesQueryDto,
  ) {
    this.admin(actor);
    const where = {
      runId: id,
      ...(query.status ? { status: query.status as any } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerFinanceDiscrepancy.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.partnerFinanceDiscrepancy.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async assignDiscrepancy(
    actor: RequestUser,
    id: string,
    dto: AssignReconciliationDiscrepancyDto,
  ) {
    this.admin(actor);
    const row = await this.prisma.partnerFinanceDiscrepancy.update({
      where: { id },
      data: {
        assignedToId: dto.assigneeUserId,
        status: 'ASSIGNED',
        notes: dto.notes?.trim(),
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_FINANCE_DISCREPANCY_ASSIGNED',
      targetType: 'PartnerFinanceDiscrepancy',
      targetId: id,
      metadata: { assigneeUserId: dto.assigneeUserId },
    });
    return row;
  }
  async resolveDiscrepancy(
    actor: RequestUser,
    id: string,
    dto: ResolveReconciliationDiscrepancyDto,
  ) {
    this.admin(actor);
    const row = await this.prisma.partnerFinanceDiscrepancy.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote: dto.resolutionNote.trim(),
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PARTNER_FINANCE_DISCREPANCY_RESOLVED',
      targetType: 'PartnerFinanceDiscrepancy',
      targetId: id,
      metadata: { status: dto.status },
    });
    return row;
  }
}
