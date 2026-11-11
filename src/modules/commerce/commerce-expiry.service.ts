import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  CouponReservationStatus,
  OrderStatus,
  PaymentAttemptStatus,
} from '../../common/types/roles.enum';
import { StudentCreditService } from '../student-rewards/student-credit.service';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CommerceExpiryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly studentCredit?: StudentCreditService,
  ) {}

  @Cron('*/5 * * * *')
  async expireUnpaidOrders() {
    const now = new Date();
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED] },
        paymentExpiresAt: { lte: now },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 500,
    });
    // One transaction per order avoids retaining wallet locks for unrelated
    // students while fulfilment or refund processing needs their credit.
    for (const order of orders)
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`order-fulfilment:${order.id}`}))`;
        const expired = await tx.order.updateMany({
          where: {
            id: order.id,
            status: {
              in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED],
            },
            paymentExpiresAt: { lte: now },
          },
          data: { status: OrderStatus.EXPIRED, expiredAt: now },
        });
        if (!expired.count) return;
        if (this.studentCredit) await this.studentCredit.release(tx, order.id);
        await tx.paymentAttempt.updateMany({
          where: {
            orderId: order.id,
            status: {
              in: [
                PaymentAttemptStatus.INITIATED,
                PaymentAttemptStatus.PENDING,
              ],
            },
          },
          data: { status: PaymentAttemptStatus.EXPIRED, completedAt: now },
        });
        await tx.couponReservation.updateMany({
          where: {
            orderId: order.id,
            status: CouponReservationStatus.RESERVED,
          },
          data: { status: CouponReservationStatus.RELEASED, releasedAt: now },
        });
      });
  }
}
