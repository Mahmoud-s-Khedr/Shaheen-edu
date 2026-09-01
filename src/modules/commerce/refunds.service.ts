import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentStatus,
  EntitlementStatus,
  OrderStatus,
  PartnerAllocationState,
  RefundRequestStatus,
  Role,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminRefundRequestsQueryDto,
  ApproveRefundDto,
  CreateRefundRequestDto,
  RefundPolicyDto,
  RefundRequestsQueryDto,
  RejectRefundDto,
} from './dto/refunds.dto';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private async activePolicy(tx: any) {
    const policy = await tx.refundPolicy.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!policy)
      throw new ConflictException(
        'Refund operations require an active database refund policy',
      );
    return policy;
  }

  private async eligibility(
    tx: any,
    policy: { eligibilityWindowDays: number; maximumConsumptionBps: number },
    studentUserId: string,
    approvedAt: Date,
    item: any,
    now: Date,
  ) {
    const placement = item.chapterId
      ? { resolvedChapterId: item.chapterId }
      : { resolvedCourseId: item.courseId };
    const contentWhere = {
      status: ContentStatus.PUBLISHED,
      placement: { is: placement },
    };
    const [totalItems, completedItems] = await Promise.all([
      tx.contentItem.count({ where: contentWhere }),
      tx.studentContentProgress.count({
        where: { studentUserId, contentItem: { is: contentWhere } },
      }),
    ]);
    const consumptionBps = totalItems
      ? Math.floor((completedItems * 10_000) / totalItems)
      : 0;
    const windowEndsAt = new Date(
      approvedAt.getTime() + policy.eligibilityWindowDays * 86_400_000,
    );
    const reasons: string[] = [];
    if (now >= windowEndsAt) reasons.push('REFUND_WINDOW_EXPIRED');
    if (consumptionBps >= policy.maximumConsumptionBps)
      reasons.push('MAXIMUM_CONSUMPTION_REACHED');
    return {
      orderItemId: item.id,
      targetType: item.targetType,
      targetId: item.courseId ?? item.chapterId,
      windowEndsAt: windowEndsAt.toISOString(),
      completedItems,
      totalItems,
      consumptionBps,
      eligible: reasons.length === 0,
      reasons,
    };
  }

  private response(row: any) {
    return {
      ...row,
      eligibility: row.eligibilitySnapshot,
      items: row.items?.map((item: any) => ({
        id: item.id,
        orderItemId: item.orderItemId,
        amountMinor: item.amountMinor,
        currency: item.currency,
        targetType: item.orderItem?.targetType,
        targetId: item.orderItem?.courseId ?? item.orderItem?.chapterId,
        title: item.orderItem?.titleSnapshot,
      })),
    };
  }

  async request(
    studentUserId: string,
    orderId: string,
    dto: CreateRefundRequestDto,
  ) {
    const now = new Date();
    try {
      const refund = await this.prisma.$transaction(
        async (tx) => {
          const order = await tx.order.findFirst({
            where: { id: orderId, studentUserId, status: OrderStatus.APPROVED },
            include: { items: { include: { refundRequestItem: true } } },
          });
          if (!order) throw new NotFoundException('Approved order not found');
          const requestedIds = dto.orderItemIds
            ? [...new Set(dto.orderItemIds)]
            : order.items.map((item: any) => item.id);
          if (
            dto.orderItemIds &&
            requestedIds.length !== dto.orderItemIds.length
          )
            throw new BadRequestException(
              'Each order item can be requested only once',
            );
          const items = order.items.filter((item: any) =>
            requestedIds.includes(item.id),
          );
          if (items.length !== requestedIds.length)
            throw new BadRequestException(
              'One or more order items do not belong to this order',
            );
          if (items.some((item: any) => item.refundRequestItem))
            throw new ConflictException(
              'A selected order item already has a refund request',
            );
          const policy = await this.activePolicy(tx);
          const eligibility = await Promise.all(
            items.map((item: any) =>
              this.eligibility(
                tx,
                policy,
                studentUserId,
                order.approvedAt!,
                item,
                now,
              ),
            ),
          );
          const rejectionReasons = eligibility.flatMap((item) =>
            item.reasons.map((reason) => `${item.orderItemId}:${reason}`),
          );
          const automaticallyRejected = rejectionReasons.length > 0;
          return tx.refundRequest.create({
            data: {
              orderId,
              studentUserId,
              status: automaticallyRejected
                ? RefundRequestStatus.REJECTED
                : RefundRequestStatus.PENDING,
              reason: dto.reason.trim(),
              eligibilitySnapshot: {
                policy: {
                  id: policy.id,
                  version: policy.version,
                  eligibilityWindowDays: policy.eligibilityWindowDays,
                  maximumConsumptionBps: policy.maximumConsumptionBps,
                },
                checkedAt: now.toISOString(),
                items: eligibility,
              },
              rejectionReason: automaticallyRejected
                ? rejectionReasons.join(', ')
                : null,
              reviewedAt: automaticallyRejected ? now : null,
              items: {
                create: items.map((item: any) => ({
                  orderItemId: item.id,
                  amountMinor: item.priceMinor,
                  currency: item.currency,
                })),
              },
            },
            include: { items: { include: { orderItem: true } } },
          });
        },
        { isolationLevel: 'Serializable' },
      );
      await this.audit.record({
        actorUserId: studentUserId,
        action:
          refund.status === RefundRequestStatus.REJECTED
            ? 'REFUND_REQUEST_AUTO_REJECTED'
            : 'REFUND_REQUESTED',
        targetType: 'RefundRequest',
        targetId: refund.id,
        metadata: {
          orderId,
          orderItemIds: refund.items.map((item: any) => item.orderItemId),
        },
      });
      return this.response(refund);
    } catch (error: any) {
      if (error?.code === 'P2002')
        throw new ConflictException(
          'A selected order item already has a refund request',
        );
      throw error;
    }
  }

  async own(studentUserId: string, query: RefundRequestsQueryDto) {
    const where = {
      studentUserId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.refundRequest.findMany({
        where,
        include: { items: { include: { orderItem: true } } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.refundRequest.count({ where }),
    ]);
    return {
      data: data.map((row) => this.response(row)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async list(actor: RequestUser, query: AdminRefundRequestsQueryDto) {
    this.admin(actor);
    const where = {
      ...(query.studentUserId ? { studentUserId: query.studentUserId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.refundRequest.findMany({
        where,
        include: {
          student: { select: { fullName: true } },
          reviewedBy: { select: { loginIdentifier: true } },
          items: { include: { orderItem: true } },
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.refundRequest.count({ where }),
    ]);
    return {
      data: data.map((row) => this.response(row)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async policy(actor: RequestUser) {
    this.admin(actor);
    return this.prisma.refundPolicy.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  async updatePolicy(actor: RequestUser, dto: RefundPolicyDto) {
    this.admin(actor);
    const policy = await this.prisma.$transaction(
      async (tx) => {
        const prior = await tx.refundPolicy.findFirst({
          where: { isActive: true },
          orderBy: { version: 'desc' },
        });
        if (prior)
          await tx.refundPolicy.update({
            where: { id: prior.id },
            data: { isActive: false },
          });
        return tx.refundPolicy.create({
          data: {
            version: (prior?.version ?? 0) + 1,
            eligibilityWindowDays: dto.eligibilityWindowDays,
            maximumConsumptionBps: dto.maximumConsumptionBps,
            updatedById: actor.id,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REFUND_POLICY_UPDATED',
      targetType: 'RefundPolicy',
      targetId: policy.id,
      metadata: {
        version: policy.version,
        eligibilityWindowDays: policy.eligibilityWindowDays,
        maximumConsumptionBps: policy.maximumConsumptionBps,
      },
    });
    return policy;
  }

  async approve(actor: RequestUser, refundId: string, dto: ApproveRefundDto) {
    this.admin(actor);
    const now = new Date();
    const refund = await this.prisma.$transaction(
      async (tx) => {
        const request = await tx.refundRequest.findUnique({
          where: { id: refundId },
          include: {
            items: {
              include: {
                orderItem: {
                  include: {
                    allocations: { where: { reversedAllocationId: null } },
                  },
                },
              },
            },
          },
        });
        if (!request) throw new NotFoundException('Refund request not found');
        const claimed = await tx.refundRequest.updateMany({
          where: { id: refundId, status: RefundRequestStatus.PENDING },
          data: {
            status: RefundRequestStatus.APPROVED,
            reviewedById: actor.id,
            reviewedAt: now,
            reviewNote: dto.reviewNote?.trim() || null,
            manualRefundReference: dto.manualRefundReference.trim(),
          },
        });
        if (!claimed.count)
          throw new ConflictException(
            'Only pending refund requests can be approved',
          );
        const orderItemIds = request.items.map((item: any) => item.orderItemId);
        await tx.studentEntitlement.updateMany({
          where: {
            studentUserId: request.studentUserId,
            orderItemId: { in: orderItemIds },
            status: EntitlementStatus.ACTIVE,
          },
          data: {
            status: EntitlementStatus.REVOKED,
            revokedAt: now,
            revokedById: actor.id,
          },
        });
        for (const refundItem of request.items) {
          for (const allocation of refundItem.orderItem.allocations.filter(
            (row: any) => row.state !== PartnerAllocationState.REVERSED,
          )) {
            await tx.partnerAllocation.create({
              data: {
                kind: allocation.kind,
                state: PartnerAllocationState.PAYABLE,
                partnerUserId: allocation.partnerUserId,
                orderItemId: allocation.orderItemId,
                publisherAgreementId: allocation.publisherAgreementId,
                referralRuleId: allocation.referralRuleId,
                basisMinor: -Math.abs(allocation.basisMinor),
                amountMinor: -Math.abs(allocation.amountMinor),
                currency: allocation.currency,
                snapshot: {
                  reversalOfAllocationId: allocation.id,
                  refundRequestId: request.id,
                  originalSnapshot: allocation.snapshot,
                },
                idempotencyKey: `refund-reversal:${request.id}:${allocation.id}`,
                reversedAllocationId: allocation.id,
              },
            });
            const reversed = await tx.partnerAllocation.updateMany({
              where: { id: allocation.id, reversedAllocationId: null },
              data: { state: PartnerAllocationState.REVERSED, reversedAt: now },
            });
            if (reversed.count !== 1)
              throw new ConflictException(
                'An allocation was reversed concurrently',
              );
          }
        }
        return tx.refundRequest.findUniqueOrThrow({
          where: { id: request.id },
          include: {
            items: { include: { orderItem: true } },
            reviewedBy: { select: { loginIdentifier: true } },
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REFUND_APPROVED',
      targetType: 'RefundRequest',
      targetId: refundId,
      metadata: {
        orderId: refund.orderId,
        manualRefundReference: refund.manualRefundReference,
        orderItemIds: refund.items.map((item: any) => item.orderItemId),
      },
    });
    return this.response(refund);
  }

  async reject(actor: RequestUser, refundId: string, dto: RejectRefundDto) {
    this.admin(actor);
    const now = new Date();
    const updated = await this.prisma.refundRequest.updateMany({
      where: { id: refundId, status: RefundRequestStatus.PENDING },
      data: {
        status: RefundRequestStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: now,
        rejectionReason: dto.rejectionReason.trim(),
        reviewNote: dto.reviewNote?.trim() || null,
      },
    });
    if (!updated.count) {
      const exists = await this.prisma.refundRequest.findUnique({
        where: { id: refundId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Refund request not found');
      throw new ConflictException(
        'Only pending refund requests can be rejected',
      );
    }
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REFUND_REJECTED',
      targetType: 'RefundRequest',
      targetId: refundId,
      metadata: { rejectionReason: dto.rejectionReason.trim() },
    });
    return this.prisma.refundRequest
      .findUniqueOrThrow({
        where: { id: refundId },
        include: {
          items: { include: { orderItem: true } },
          reviewedBy: { select: { loginIdentifier: true } },
        },
      })
      .then((row) => this.response(row));
  }
}
