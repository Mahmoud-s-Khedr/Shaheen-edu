import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  CouponReservationStatus,
  PromotionKind,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';

export type PricedTarget = {
  targetType: 'COURSE' | 'CHAPTER';
  courseId?: string;
  chapterId?: string;
  title: string;
  basePriceMinor: number;
  currency: string;
};

export type PriceQuote = {
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  coupon: {
    id: string;
    code: string;
    discountMinor: number;
    snapshot: object;
  } | null;
  items: Array<
    PricedTarget & {
      discountMinor: number;
      finalPriceMinor: number;
      promotionSnapshot: object | null;
    }
  >;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private discount(kind: PromotionKind, amount: number, base: number) {
    return Math.min(
      base,
      kind === PromotionKind.PERCENTAGE
        ? Math.floor((base * amount) / 10_000)
        : amount,
    );
  }

  private matches(
    target: PricedTarget,
    promotion: {
      appliesToAll: boolean;
      targets: Array<{ courseId: string | null; chapterId: string | null }>;
    },
  ) {
    return (
      promotion.appliesToAll ||
      promotion.targets.some(
        (item) =>
          item.courseId === target.courseId ||
          item.chapterId === target.chapterId,
      )
    );
  }

  async quote(
    targets: PricedTarget[],
    couponCode?: string,
    studentUserId?: string,
    client: any = this.prisma,
  ): Promise<PriceQuote> {
    const now = new Date();
    const campaigns = await client.discountCampaign.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      include: { targets: { select: { courseId: true, chapterId: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    let coupon: any = null;
    if (couponCode?.trim()) {
      coupon = await client.coupon.findUnique({
        where: { code: couponCode.trim().toUpperCase() },
        include: { targets: { select: { courseId: true, chapterId: true } } },
      });
      if (
        !coupon ||
        !coupon.isActive ||
        coupon.startsAt > now ||
        coupon.endsAt <= now
      )
        throw new BadRequestException('Coupon is invalid or inactive');
      const eligibleSubtotal = targets
        .filter((target) => this.matches(target, coupon))
        .reduce((sum, target) => sum + target.basePriceMinor, 0);
      if (!eligibleSubtotal)
        throw new BadRequestException(
          'Coupon does not apply to the selected items',
        );
      if (eligibleSubtotal < coupon.minimumOrderMinor)
        throw new BadRequestException('Coupon minimum order amount is not met');
      if (coupon.usageLimit !== null) {
        const count = await client.couponReservation.count({
          where: {
            couponId: coupon.id,
            status: {
              in: [
                CouponReservationStatus.RESERVED,
                CouponReservationStatus.REDEEMED,
              ],
            },
          },
        });
        if (count >= coupon.usageLimit)
          throw new ConflictException('Coupon usage limit has been reached');
      }
      if (studentUserId && coupon.perStudentUsageLimit !== null) {
        const count = await client.couponReservation.count({
          where: {
            couponId: coupon.id,
            studentUserId,
            status: {
              in: [
                CouponReservationStatus.RESERVED,
                CouponReservationStatus.REDEEMED,
              ],
            },
          },
        });
        if (count >= coupon.perStudentUsageLimit)
          throw new ConflictException(
            'Coupon usage limit has been reached for this student',
          );
      }
    }

    const campaignDiscounts = targets.map((target) => {
      const candidates = campaigns
        .filter((campaign: any) => this.matches(target, campaign))
        .map((campaign: any) => ({
          campaign,
          amount: this.discount(
            campaign.kind,
            campaign.amount,
            target.basePriceMinor,
          ),
        }))
        .sort(
          (a: any, b: any) =>
            b.amount - a.amount ||
            b.campaign.priority - a.campaign.priority ||
            a.campaign.id.localeCompare(b.campaign.id),
        );
      return candidates[0] ?? null;
    });
    const rawCouponDiscounts = coupon
      ? targets.map((target) =>
          this.matches(target, coupon)
            ? this.discount(coupon.kind, coupon.amount, target.basePriceMinor)
            : 0,
        )
      : targets.map(() => 0);
    const rawCouponTotal = rawCouponDiscounts.reduce(
      (sum, amount) => sum + amount,
      0,
    );
    const cappedCouponTotal = coupon?.maximumDiscountMinor
      ? Math.min(rawCouponTotal, coupon.maximumDiscountMinor)
      : rawCouponTotal;
    const couponDiscounts = rawCouponTotal
      ? rawCouponDiscounts.map((amount, index) =>
          index === rawCouponDiscounts.length - 1
            ? 0
            : Math.floor((amount * cappedCouponTotal) / rawCouponTotal),
        )
      : rawCouponDiscounts;
    if (rawCouponTotal)
      couponDiscounts[couponDiscounts.length - 1] =
        cappedCouponTotal -
        couponDiscounts.slice(0, -1).reduce((sum, amount) => sum + amount, 0);

    const items = targets.map((target, index) => {
      const campaign = campaignDiscounts[index];
      const couponDiscount = couponDiscounts[index];
      const campaignDiscount = campaign?.amount ?? 0;
      const useCoupon = couponDiscount > campaignDiscount;
      const discountMinor = useCoupon ? couponDiscount : campaignDiscount;
      const promotionSnapshot = discountMinor
        ? useCoupon
          ? {
              source: 'COUPON',
              couponId: coupon.id,
              code: coupon.code,
              kind: coupon.kind,
              amount: coupon.amount,
            }
          : {
              source: 'CAMPAIGN',
              campaignId: campaign.campaign.id,
              name: campaign.campaign.name,
              kind: campaign.campaign.kind,
              amount: campaign.campaign.amount,
              priority: campaign.campaign.priority,
            }
        : null;
      return {
        ...target,
        discountMinor,
        finalPriceMinor: target.basePriceMinor - discountMinor,
        promotionSnapshot,
      };
    });
    const couponApplied = coupon
      ? items.reduce(
          (sum, item) =>
            sum +
            (item.promotionSnapshot &&
            (item.promotionSnapshot as any).source === 'COUPON'
              ? item.discountMinor
              : 0),
          0,
        )
      : 0;
    if (coupon && couponApplied === 0)
      throw new BadRequestException(
        'Coupon does not improve the current price',
      );
    const subtotalMinor = targets.reduce(
      (sum, target) => sum + target.basePriceMinor,
      0,
    );
    const discountMinor = items.reduce(
      (sum, item) => sum + item.discountMinor,
      0,
    );
    return {
      subtotalMinor,
      discountMinor,
      totalMinor: subtotalMinor - discountMinor,
      coupon: coupon
        ? {
            id: coupon.id,
            code: coupon.code,
            discountMinor: couponApplied,
            snapshot: {
              id: coupon.id,
              code: coupon.code,
              name: coupon.name,
              kind: coupon.kind,
              amount: coupon.amount,
              minimumOrderMinor: coupon.minimumOrderMinor,
              maximumDiscountMinor: coupon.maximumDiscountMinor,
            },
          }
        : null,
      items,
    };
  }
}
