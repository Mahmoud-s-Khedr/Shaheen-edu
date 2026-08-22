import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponReservationStatus,
  EntitlementSource,
  EntitlementStatus,
  OrderStatus,
} from '../../common/types/roles.enum';
import { AuditService } from '../audit/audit.service';

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
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true, couponReservation: true, receipt: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === OrderStatus.APPROVED) return order;
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
      },
    });
    return tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, receipt: true },
    });
  }
}
