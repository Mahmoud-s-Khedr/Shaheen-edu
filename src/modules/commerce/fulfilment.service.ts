import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponReservationStatus,
  EntitlementSource,
  EntitlementStatus,
  OrderStatus,
  PartnerAllocationKind,
  ReferralCommissionKind,
} from '../../common/types/roles.enum';
import { AuditService } from '../audit/audit.service';
import { allocateBundleReferral } from './bundle-allocation';

function agreementSpecificity(agreement: {
  courseId: string | null;
  chapterId: string | null;
  lessonId: string | null;
}) {
  if (agreement.lessonId) return 3;
  if (agreement.chapterId) return 2;
  if (agreement.courseId) return 1;
  return 0;
}

export class SalesOfferUnavailableError extends ConflictException {
  constructor() {
    super('Offer is sold out or already purchased');
  }
}

@Injectable()
export class FulfilmentService {
  constructor(private readonly audit: AuditService) {}

  async fulfil(
    tx: any,
    input: {
      orderId: string;
      actorUserId?: string;
      paymentAttemptId?: string | null;
    },
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-fulfilment:${input.orderId}`}))`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        items: { include: { chapter: { select: { courseId: true } } } },
        couponReservation: true,
        salesOfferPurchases: true,
        receipt: true,
        referralAttribution: {
          include: { rule: { include: { program: true } }, referralCode: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.APPROVED) return order;
    if (
      input.paymentAttemptId &&
      (order.status === OrderStatus.PAYMENT_REVIEW ||
        (order.status === OrderStatus.CANCELLED &&
          order.externalRefundReference))
    )
      return order;
    const purchases = [...(order.salesOfferPurchases ?? [])].sort(
      (a: any, b: any) => a.salesOfferId.localeCompare(b.salesOfferId),
    );
    for (const purchase of purchases) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-offer:${purchase.salesOfferId}`}))`;
      const offer = await tx.salesOffer.findUniqueOrThrow({
        where: { id: purchase.salesOfferId },
      });
      const where = {
        salesOfferId: offer.id,
        allocatedAt: { not: null },
        releasedAt: null,
      };
      const [sold, alreadyPurchased] = await Promise.all([
        tx.salesOfferPurchase.count({ where }),
        tx.salesOfferPurchase.count({
          where: { ...where, studentUserId: order.studentUserId },
        }),
      ]);
      if (
        alreadyPurchased ||
        (offer.purchaseLimit != null && sold >= offer.purchaseLimit)
      )
        throw new SalesOfferUnavailableError();
    }
    await this.assertReferralUsageAvailable(tx, order.referralAttribution);
    const claimed = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.SUBMITTED] },
      },
      data: { status: OrderStatus.APPROVED, approvedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Order cannot be fulfilled');
    const now = new Date();
    if (purchases.length)
      await tx.salesOfferPurchase.updateMany({
        where: {
          id: { in: purchases.map((purchase: any) => purchase.id) },
          allocatedAt: null,
        },
        data: { allocatedAt: now },
      });
    const bundleReferralShares = new Map<string, number>();
    if (order.referralAttribution) {
      const terms = order.referralAttribution.snapshot as any;
      for (const purchase of purchases) {
        const items = order.items.filter(
          (item: any) => item.salesOfferPurchaseId === purchase.id,
        );
        for (const [key, share] of allocateBundleReferral(items, terms))
          bundleReferralShares.set(key, share);
      }
    }
    // Allocations are created only after the order status claim succeeds, in
    // this transaction. The unique order-item/kind key makes webhook and
    // manual-approval retries harmless.
    for (const item of order.items) {
      const target = item.chapterId
        ? [{ chapterId: item.chapterId }, { courseId: item.chapter?.courseId }]
        : [{ courseId: item.courseId }];
      const agreements = await tx.publisherAgreement.findMany({
        where: {
          OR: target.filter((value) => Object.values(value)[0]),
          status: 'ACTIVE',
          isPrimary: true,
          startsAt: { lte: now },
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
        },
        orderBy: { startsAt: 'desc' },
      });
      // A chapter/lesson agreement always takes precedence over a broader
      // course agreement. Ordering only by start time made same-timestamp
      // agreements nondeterministic, which could underpay a publisher.
      const agreement = [...agreements].sort((left, right) => {
        const scopeDifference =
          agreementSpecificity(right) - agreementSpecificity(left);
        if (scopeDifference) return scopeDifference;
        return right.startsAt.getTime() - left.startsAt.getTime();
      })[0];
      if (agreement) {
        const amount =
          agreement.payoutKind === ReferralCommissionKind.PERCENTAGE
            ? Math.floor(
                (item.priceMinor * (agreement.revenueShareBps ?? 0)) / 10_000,
              )
            : (agreement.fixedPayoutMinor ?? 0);
        if (amount > 0 && amount <= item.priceMinor)
          await tx.partnerAllocation.createMany({
            data: [
              {
                kind: PartnerAllocationKind.PUBLISHER_SALE,
                partnerUserId: agreement.publisherUserId,
                orderItemId: item.id,
                publisherAgreementId: agreement.id,
                basisMinor: item.priceMinor,
                amountMinor: amount,
                currency: item.currency,
                idempotencyKey: `publisher-sale:${item.id}`,
                snapshot: {
                  agreementId: agreement.id,
                  version: agreement.version,
                  payoutKind: agreement.payoutKind,
                  revenueShareBps: agreement.revenueShareBps,
                  fixedPayoutMinor: agreement.fixedPayoutMinor,
                  target: {
                    courseId: agreement.courseId,
                    chapterId: agreement.chapterId,
                    lessonId: agreement.lessonId,
                  },
                },
              },
            ],
            skipDuplicates: true,
          });
      }
      const attribution = order.referralAttribution;
      if (attribution) {
        // Commission terms are frozen at checkout. Reading the live rule here
        // would retroactively change an order that is approved after a rule is
        // replaced or suspended.
        const terms = attribution.snapshot as {
          partnerUserId?: string;
          kind?: ReferralCommissionKind;
          percentageBps?: number | null;
          fixedCommissionMinor?: number | null;
          maximumCommissionMinor?: number | null;
        };
        const amount = item.salesOfferPurchaseId
          ? (bundleReferralShares.get(item.id) ?? 0)
          : terms.kind === ReferralCommissionKind.FIXED_PER_SALE
            ? (terms.fixedCommissionMinor ?? 0)
            : terms.kind === ReferralCommissionKind.PERCENTAGE_CAPPED
              ? Math.min(
                  Math.floor(
                    (item.priceMinor * (terms.percentageBps ?? 0)) / 10_000,
                  ),
                  terms.maximumCommissionMinor ?? 0,
                )
              : Math.floor(
                  (item.priceMinor * (terms.percentageBps ?? 0)) / 10_000,
                );
        if (amount > 0 && amount <= item.priceMinor && terms.partnerUserId)
          await tx.partnerAllocation.createMany({
            data: [
              {
                kind: PartnerAllocationKind.REFERRAL_COMMISSION,
                partnerUserId: terms.partnerUserId,
                orderItemId: item.id,
                referralRuleId: attribution.ruleId,
                basisMinor: item.priceMinor,
                amountMinor: amount,
                currency: item.currency,
                idempotencyKey: `referral-commission:${item.id}`,
                snapshot: attribution.snapshot,
              },
            ],
            skipDuplicates: true,
          });
      }
    }
    await tx.studentEntitlement.updateMany({
      where: {
        studentUserId: order.studentUserId,
        status: EntitlementStatus.ACTIVE,
        expiresAt: { lte: now },
        OR: order.items.map((item: any) =>
          item.courseId
            ? { courseId: item.courseId }
            : { chapterId: item.chapterId },
        ),
      },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: now,
        revokedById: input.actorUserId ?? order.studentUserId,
      },
    });
    await tx.studentEntitlement.createMany({
      data: order.items.map((item: any) => ({
        studentUserId: order.studentUserId,
        courseId: item.courseId,
        chapterId: item.chapterId,
        orderItemId: item.id,
        source: EntitlementSource.PAYMENT,
        grantedById: input.actorUserId ?? order.studentUserId,
      })),
    });
    if (order.couponReservation?.status === CouponReservationStatus.RESERVED) {
      await tx.couponReservation.update({
        where: { id: order.couponReservation.id },
        data: { status: CouponReservationStatus.REDEEMED, redeemedAt: now },
      });
    }
    if (!order.receipt) {
      const reference = `RCT-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${order.id.slice(-10).toUpperCase()}`;
      await tx.paymentReceipt.create({
        data: {
          orderId: order.id,
          paymentAttemptId: input.paymentAttemptId ?? null,
          reference,
          snapshot: {
            orderId: order.id,
            paymentChannel: order.paymentChannel,
            subtotalMinor: order.subtotalMinor,
            discountMinor: order.discountMinor,
            totalMinor: order.totalMinor,
            currency: order.currency,
            approvedAt: now,
            items: order.items.map((item: any) => ({
              title: item.titleSnapshot,
              basePriceMinor: item.basePriceMinor,
              discountMinor: item.discountMinor,
              totalMinor: item.priceMinor,
              appliedPromotion: item.appliedPromotionSnapshot,
              salesOfferPurchaseId: item.salesOfferPurchaseId,
            })),
            bundles: purchases.map((purchase: any) => ({
              id: purchase.id,
              offerId: purchase.salesOfferId,
              snapshot: purchase.snapshot,
            })),
          },
        },
      });
    }
    await this.audit.recordWithClient(tx, {
      actorUserId: input.actorUserId ?? order.studentUserId,
      action: 'ORDER_FULFILLED',
      targetType: 'Order',
      targetId: order.id,
      metadata: {
        paymentAttemptId: input.paymentAttemptId ?? null,
        channel: order.paymentChannel,
        salesOfferPurchaseIds: purchases.map((purchase: any) => purchase.id),
      },
    });
    return tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, receipt: true },
    });
  }

  /**
   * Checkout intentionally counts only approved orders.  Rechecking that
   * policy at the approval boundary, while holding stable advisory locks,
   * prevents two submitted orders from consuming the same final slot.
   */
  private async assertReferralUsageAvailable(tx: any, attribution: any) {
    if (!attribution) return;
    const program = attribution.rule.program;
    const code = attribution.referralCode;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral-program:${program.id}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`referral-code:${code.id}`}))`;
    const approved = { order: { status: OrderStatus.APPROVED } };
    const [programUses, codeUses, programStudentUses, codeStudentUses] =
      await Promise.all([
        tx.orderReferralAttribution.count({
          where: { referralProgramId: program.id, ...approved },
        }),
        tx.orderReferralAttribution.count({
          where: { referralCodeId: code.id, ...approved },
        }),
        tx.orderReferralAttribution.count({
          where: {
            referralProgramId: program.id,
            studentUserId: attribution.studentUserId,
            ...approved,
          },
        }),
        tx.orderReferralAttribution.count({
          where: {
            referralCodeId: code.id,
            studentUserId: attribution.studentUserId,
            ...approved,
          },
        }),
      ]);
    if (
      (program.usageLimit != null && programUses >= program.usageLimit) ||
      (code.usageLimit != null && codeUses >= code.usageLimit) ||
      (program.perStudentUsageLimit != null &&
        programStudentUses >= program.perStudentUsageLimit) ||
      (code.perStudentUsageLimit != null &&
        codeStudentUses >= code.perStudentUsageLimit)
    ) {
      throw new BadRequestException(
        'Referral code usage limit has been reached',
      );
    }
  }
}
