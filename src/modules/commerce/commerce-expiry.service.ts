import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CouponReservationStatus,
  OrderStatus,
  PaymentAttemptStatus,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CommerceExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/5 * * * *')
  async expireUnpaidOrders() {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122402)`;
      const orders = await tx.order.findMany({
        where: {
          status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED] },
          paymentExpiresAt: { lte: now },
        },
        select: { id: true },
      });
      if (!orders.length) return;
      await tx.order.updateMany({
        where: {
          id: { in: orders.map((order) => order.id) },
          status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED] },
        },
        data: { status: OrderStatus.EXPIRED, expiredAt: now },
      });
      await tx.paymentAttempt.updateMany({
        where: {
          orderId: { in: orders.map((order) => order.id) },
          status: {
            in: [PaymentAttemptStatus.INITIATED, PaymentAttemptStatus.PENDING],
          },
        },
        data: { status: PaymentAttemptStatus.EXPIRED, completedAt: now },
      });
      await tx.couponReservation.updateMany({
        where: {
          orderId: { in: orders.map((order) => order.id) },
          status: CouponReservationStatus.RESERVED,
        },
        data: { status: CouponReservationStatus.RELEASED, releasedAt: now },
      });
    });
  }
}
