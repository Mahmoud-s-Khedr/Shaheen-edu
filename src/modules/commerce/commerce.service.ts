import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  AssetKind,
  CommerceTargetType,
  ContentStatus,
  EntitlementStatus,
  ManualPaymentSubmissionStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentChannel,
  Role,
} from '../../common/types/roles.enum';
import {
  toPaginationMeta,
  type PaginationQueryDto,
  type SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { AuditService } from '../audit/audit.service';
import { paginateArabicSearch } from '../../common/search/arabic-search';
import type {
  CartTargetDto,
  CheckoutDto,
  CreateCouponDto,
  CreateDiscountCampaignDto,
  CreatePaymentMethodDto,
  PaymentSubmissionQueryDto,
  PricePreviewDto,
  RejectPaymentDto,
  UpdateCouponDto,
  UpdateDiscountCampaignDto,
  UpdatePaymentMethodDto,
} from './dto/commerce.dto';
import type { AppConfig } from '../../config/configuration';
import { PricingService, type PricedTarget } from './pricing.service';
import { PaymobService } from './paymob.service';
import { FulfilmentService } from './fulfilment.service';

type Target = PricedTarget & {
  targetType: CommerceTargetType;
  courseForCoverage: string;
};
const published = ContentStatus.PUBLISHED;

@Injectable()
export class CommerceService {
  private readonly commerceConfig: AppConfig['commerce'];
  private readonly features: AppConfig['features'];
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly audit: AuditService,
    private readonly pricing?: PricingService,
    private readonly paymob?: PaymobService,
    private readonly fulfilment?: FulfilmentService,
    config?: ConfigService<AppConfig, true>,
  ) {
    this.commerceConfig = config?.get('commerce', { infer: true }) ?? {
      paymobBaseUrl: '',
      paymobSecretKey: '',
      paymobPublicKey: '',
      paymobHmacSecret: '',
      paymobIntegrationIds: [],
      paymobNotificationUrl: '',
      paymobRedirectUrl: '',
      paymobTimeoutMs: 15000,
      paymobOrderExpirySeconds: 1800,
      manualOrderExpirySeconds: 86400,
    };
    this.features = config?.get('features', { infer: true }) ?? {
      referralsEnabled: false, referralAllowedStudentIds: [], partnerLedgerEnabled: false,
      partnerLedgerAllowedUserIds: [], reportExportsEnabled: false,
    };
  }
  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private assertIdempotencyKey(key: string) {
    if (!key?.trim())
      throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 200)
      throw new BadRequestException(
        'Idempotency-Key header must not exceed 200 characters',
      );
  }
  private async studentGrade(studentUserId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { academicGradeId: true },
    });
    if (!profile?.academicGradeId)
      throw new ConflictException('Student academic grade is required');
    return profile.academicGradeId;
  }
  private async target(
    studentUserId: string,
    dto: CartTargetDto,
  ): Promise<Target> {
    const gradeId = await this.studentGrade(studentUserId);
    if (dto.targetType === CommerceTargetType.COURSE) {
      const course = await this.prisma.course.findFirst({
        where: {
          id: dto.targetId,
          status: published,
          subject: {
            academicGradeId: gradeId,
            status: published,
            academicGrade: { status: published },
          },
        },
      });
      if (!course) throw new NotFoundException('Purchasable course not found');
      if (
        !course.isPurchasable ||
        course.currency !== 'EGP' ||
        course.priceMinor === null
      )
        throw new ConflictException('Course is not purchasable');
      return {
        targetType: dto.targetType,
        courseId: course.id,
        title: course.title,
        basePriceMinor: course.priceMinor,
        currency: course.currency,
        courseForCoverage: course.id,
      };
    }
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: dto.targetId,
        status: published,
        course: {
          status: published,
          subject: {
            academicGradeId: gradeId,
            status: published,
            academicGrade: { status: published },
          },
        },
      },
      include: { course: true },
    });
    if (!chapter) throw new NotFoundException('Purchasable chapter not found');
    const pricing = chapter.isPurchasable === null ? chapter.course : chapter;
    if (
      !pricing.isPurchasable ||
      pricing.currency !== 'EGP' ||
      pricing.priceMinor === null
    )
      throw new ConflictException('Chapter is not purchasable');
    return {
      targetType: dto.targetType,
      chapterId: chapter.id,
      title: chapter.title,
      basePriceMinor: pricing.priceMinor,
      currency: pricing.currency,
      courseForCoverage: chapter.courseId,
    };
  }
  private async assertNotEntitled(studentUserId: string, target: Target) {
    const now = new Date();
    const grant = await this.prisma.studentEntitlement.findFirst({
      where: {
        studentUserId,
        status: EntitlementStatus.ACTIVE,
        revokedAt: null,
        startsAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          {
            OR: [
              { courseId: target.courseForCoverage },
              ...(target.chapterId ? [{ chapterId: target.chapterId }] : []),
            ],
          },
        ],
      },
    });
    if (grant) throw new ConflictException('Content is already entitled');
  }
  private cartItem(item: any, quote: any) {
    return {
      id: item.id,
      targetType: quote.targetType,
      targetId: quote.courseId ?? quote.chapterId,
      targetName: quote.title,
      title: quote.title,
      price: { amountMinor: quote.finalPriceMinor, currency: quote.currency },
      basePrice: {
        amountMinor: quote.basePriceMinor,
        currency: quote.currency,
      },
      discount: { amountMinor: quote.discountMinor, currency: quote.currency },
      promotion: quote.promotionSnapshot,
    };
  }
  private async paymentProof(studentUserId: string, assetId: string) {
    // Direct Bunny uploads remain UPLOADING until the application verifies the
    // object. Completing here keeps receipt submission atomic from the
    // student's perspective: an uploaded proof cannot be submitted before its
    // size, MIME type, and signature have been checked.
    await this.assets.completeUpload(
      { id: studentUserId, role: Role.STUDENT } as RequestUser,
      assetId,
    );
    const asset = await this.assets.getReady(assetId);
    if (
      asset.kind !== AssetKind.PAYMENT_PROOF ||
      asset.uploadedById !== studentUserId
    )
      throw new ConflictException(
        'Payment proof must be a ready asset uploaded by the student',
      );
    const used = await (this.prisma as any).manualPaymentSubmission.findFirst({
      where: { proofAssetId: assetId },
      select: { id: true },
    });
    if (used)
      throw new ConflictException(
        'Payment proof asset has already been submitted',
      );
    return asset;
  }

  async methods(query: SearchPaginationQueryDto) {
    const where = { isActive: true };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.manualPaymentMethod,
      target: 'manualPaymentMethod',
      q: query.q,
      scope: { where: Prisma.sql`t."isActive" = true` },
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where,
      args: {
        select: {
          id: true,
          titleAr: true,
          instructionsAr: true,
          titleEn: true,
          instructionsEn: true,
        },
      },
      page: query.page,
      limit: query.limit,
    });
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async pricePreview(studentUserId: string, dto: PricePreviewDto) {
    if (!dto.targets?.length)
      throw new BadRequestException('At least one target is required');
    const targets = await Promise.all(
      dto.targets.map((target) => this.target(studentUserId, target)),
    );
    const quote = await this.pricing!.quote(targets, dto.couponCode, studentUserId);
    const referral = dto.referralCode
      ? await this.resolveReferral(dto.referralCode, studentUserId, targets)
      : null;
    return { ...quote, referral: referral ? { code: referral.code, programId: referral.programId } : null };
  }

  private async resolveReferral(code: string, studentUserId: string, targets: Target[], client: any = this.prisma) {
    if (!this.features.referralsEnabled || (this.features.referralAllowedStudentIds.length && !this.features.referralAllowedStudentIds.includes('*') && !this.features.referralAllowedStudentIds.includes(studentUserId))) throw new ConflictException('Referral codes are not enabled for this account');
    const now = new Date(); const normalized = code.trim().toUpperCase();
    const referral = await client.referralCode.findUnique({ where: { code: normalized }, include: {
      program: { include: { rules: { where: { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { version: 'desc' }, take: 1 } } },
    } });
    if (!referral || !referral.isActive || (referral.startsAt && referral.startsAt > now) || (referral.endsAt && referral.endsAt <= now) ||
      referral.program.status !== 'ACTIVE' || referral.program.startsAt > now || (referral.program.endsAt && referral.program.endsAt <= now))
      throw new BadRequestException('Referral code is not eligible');
    if (referral.program.partnerUserId === studentUserId) throw new ForbiddenException('Self-referral is not allowed');
    if (!referral.program.appliesToAll && !targets.some((target) => target.courseForCoverage === referral.program.courseId || target.chapterId === referral.program.chapterId))
      throw new BadRequestException('Referral code is not eligible for this cart');
    const approved = { order: { status: OrderStatus.APPROVED } };
    const [programUses, codeUses, programStudentUses, codeStudentUses] = await Promise.all([
      client.orderReferralAttribution.count({ where: { referralProgramId: referral.programId, ...approved } }),
      client.orderReferralAttribution.count({ where: { referralCodeId: referral.id, ...approved } }),
      client.orderReferralAttribution.count({ where: { referralProgramId: referral.programId, studentUserId, ...approved } }),
      client.orderReferralAttribution.count({ where: { referralCodeId: referral.id, studentUserId, ...approved } }),
    ]);
    if ((referral.program.usageLimit !== null && referral.program.usageLimit !== undefined && programUses >= referral.program.usageLimit) ||
      (referral.usageLimit !== null && referral.usageLimit !== undefined && codeUses >= referral.usageLimit) ||
      (referral.program.perStudentUsageLimit !== null && referral.program.perStudentUsageLimit !== undefined && programStudentUses >= referral.program.perStudentUsageLimit) ||
      (referral.perStudentUsageLimit !== null && referral.perStudentUsageLimit !== undefined && codeStudentUses >= referral.perStudentUsageLimit))
      throw new BadRequestException('Referral code usage limit has been reached');
    const rule = referral.program.rules[0]; if (!rule) throw new BadRequestException('Referral code has no active commission rule');
    return {
      code: referral.code, codeId: referral.id, programId: referral.programId, rule,
      partnerUserId: referral.program.partnerUserId,
      snapshot: {
        code: referral.code, codeId: referral.id, programId: referral.programId,
        partnerUserId: referral.program.partnerUserId, ruleId: rule.id, version: rule.version,
        kind: rule.kind, percentageBps: rule.percentageBps,
        fixedCommissionMinor: rule.fixedCommissionMinor,
        maximumCommissionMinor: rule.maximumCommissionMinor, currency: rule.currency,
      },
    };
  }
  async cart(studentUserId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { studentUserId },
      include: { items: true },
    });
    const items = cart?.items ?? [];
    const targets = await Promise.all(
      items.map((item) =>
        this.target(studentUserId, {
          targetType: item.targetType,
          targetId: item.courseId ?? item.chapterId!,
        }),
      ),
    );
    const quote = await this.pricing!.quote(targets);
    return {
      data: items.map((item, index) => this.cartItem(item, quote.items[index])),
      subtotal: { amountMinor: quote.subtotalMinor, currency: 'EGP' },
      discount: { amountMinor: quote.discountMinor, currency: 'EGP' },
      total: { amountMinor: quote.totalMinor, currency: 'EGP' },
    };
  }
  async addCartItem(studentUserId: string, dto: CartTargetDto) {
    const target = await this.target(studentUserId, dto);
    await this.assertNotEntitled(studentUserId, target);
    const cart = await this.prisma.cart.upsert({
      where: { studentUserId },
      create: { studentUserId },
      update: {},
    });
    const existing = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: { chapter: true },
    });
    if (
      existing.some(
        (x) =>
          x.courseId === target.courseId ||
          x.chapterId === target.chapterId ||
          (target.courseId && x.chapter?.courseId === target.courseId) ||
          (target.chapterId && x.courseId === target.courseForCoverage),
      )
    )
      throw new ConflictException('Cart already contains overlapping content');
    try {
      const item = await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          targetType: target.targetType,
          courseId: target.courseId,
          chapterId: target.chapterId,
        },
      });
      const quote = await this.pricing!.quote([target]);
      return this.cartItem(item, quote.items[0]);
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new ConflictException('Item is already in cart');
      throw error;
    }
  }
  async removeCartItem(studentUserId: string, id: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cart: { studentUserId } },
    });
    if (!item) throw new NotFoundException('Cart item not found');
    await this.prisma.cartItem.delete({ where: { id } });
    return { id, deleted: true };
  }
  private snapshot(method: any) {
    return {
      titleAr: method.titleAr,
      instructionsAr: method.instructionsAr,
      titleEn: method.titleEn,
      instructionsEn: method.instructionsEn,
    };
  }
  async checkout(studentUserId: string, dto: CheckoutDto, key: string) {
    this.assertIdempotencyKey(key);
    const prior = await this.prisma.commerceIdempotencyKey.findUnique({
      where: {
        studentUserId_operation_key: {
          studentUserId,
          operation: 'CHECKOUT',
          key,
        },
      },
    });
    if (prior) return this.order(studentUserId, prior.resourceId);
    const paymentChannel = dto.paymentChannel ?? PaymentChannel.MANUAL;
    const method =
      paymentChannel === PaymentChannel.MANUAL
        ? await this.prisma.manualPaymentMethod.findFirst({
            where: { id: dto.manualPaymentMethodId, isActive: true },
          })
        : null;
    if (paymentChannel === PaymentChannel.MANUAL && !method)
      throw new NotFoundException('Active payment method not found');
    const cart = await this.prisma.cart.findUnique({
      where: { studentUserId },
      include: { items: true },
    });
    if (!cart?.items.length) throw new ConflictException('Cart is empty');
    const targets = await Promise.all(
      cart.items.map((x) =>
        this.target(studentUserId, {
          targetType: x.targetType,
          targetId: x.courseId ?? x.chapterId!,
        }),
      ),
    );
    await Promise.all(
      targets.map((x) => this.assertNotEntitled(studentUserId, x)),
    );
    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          const quote = await this.pricing!.quote(
            targets,
            dto.couponCode,
            studentUserId,
            tx,
          );
          const referral = dto.referralCode
            ? await this.resolveReferral(dto.referralCode, studentUserId, targets, tx)
            : null;
          const paymentExpiresAt = new Date(
            Date.now() +
              (paymentChannel === PaymentChannel.PAYMOB
                ? this.commerceConfig.paymobOrderExpirySeconds
                : this.commerceConfig.manualOrderExpirySeconds) *
                1000,
          );
          const created = await tx.order.create({
            data: {
              studentUserId,
              manualPaymentMethodId: method?.id,
              paymentChannel,
              paymentMethodSnapshot: method
                ? this.snapshot(method)
                : { provider: 'PAYMOB', checkout: 'HOSTED_REDIRECT' },
              subtotalMinor: quote.subtotalMinor,
              discountMinor: quote.discountMinor,
              totalMinor: quote.totalMinor,
              currency: 'EGP',
              paymentExpiresAt,
              items: {
                create: quote.items.map((x) => ({
                  targetType: x.targetType,
                  courseId: x.courseId,
                  chapterId: x.chapterId,
                  titleSnapshot: x.title,
                  basePriceMinor: x.basePriceMinor,
                  discountMinor: x.discountMinor,
                  priceMinor: x.finalPriceMinor,
                  currency: x.currency,
                  appliedPromotionSnapshot: x.promotionSnapshot ?? undefined,
                })),
              },
              couponReservation: quote.coupon
                ? {
                    create: {
                      couponId: quote.coupon.id,
                      studentUserId,
                      discountMinor: quote.coupon.discountMinor,
                      snapshot: quote.coupon.snapshot,
                    },
                  }
                : undefined,
              referralAttribution: referral ? { create: {
                studentUserId, referralCodeId: referral.codeId, referralProgramId: referral.programId,
                ruleId: referral.rule.id, snapshot: referral.snapshot,
              } } : undefined,
            },
            include: { items: true },
          });
          // Remove only the snapshot that was purchased. A concurrently added
          // cart item must survive this checkout.
          await tx.cartItem.deleteMany({
            where: { id: { in: cart.items.map((item) => item.id) } },
          });
          await tx.commerceIdempotencyKey.create({
            data: {
              studentUserId,
              operation: 'CHECKOUT',
              key,
              resourceId: created.id,
            },
          });
          return created;
        },
        { isolationLevel: 'Serializable' },
      );
      await this.audit.record({
        actorUserId: studentUserId,
        action: 'ORDER_CREATED',
        targetType: 'Order',
        targetId: order.id,
        metadata: { paymentChannel },
      });
      const response = await this.order(studentUserId, order.id);
      if (paymentChannel === PaymentChannel.PAYMOB)
        return {
          ...response,
          paymob: await this.createPaymobAttempt(
            studentUserId,
            order.id,
            `${key}:paymob`,
          ),
        };
      return response;
    } catch (error: any) {
      if (error.code === 'P2002') {
        const saved = await this.prisma.commerceIdempotencyKey.findUnique({
          where: {
            studentUserId_operation_key: {
              studentUserId,
              operation: 'CHECKOUT',
              key,
            },
          },
        });
        if (saved) return this.order(studentUserId, saved.resourceId);
      }
      throw error;
    }
  }
  private orderDto(order: any) {
    return {
      id: order.id,
      status: order.status,
      paymentChannel: order.paymentChannel,
      subtotal: { amountMinor: order.subtotalMinor, currency: order.currency },
      discount: { amountMinor: order.discountMinor, currency: order.currency },
      total: { amountMinor: order.totalMinor, currency: order.currency },
      paymentMethod: order.paymentMethodSnapshot,
      createdAt: order.createdAt,
      approvedAt: order.approvedAt,
      cancelledAt: order.cancelledAt,
      paymentExpiresAt: order.paymentExpiresAt,
      receiptReference: order.receipt?.reference ?? null,
      items: order.items.map((x: any) => ({
        id: x.id,
        targetType: x.targetType,
        targetId: x.courseId ?? x.chapterId,
        targetName: x.titleSnapshot,
        title: x.titleSnapshot,
        basePrice: { amountMinor: x.basePriceMinor, currency: x.currency },
        discount: { amountMinor: x.discountMinor, currency: x.currency },
        price: { amountMinor: x.priceMinor, currency: x.currency },
        promotion: x.appliedPromotionSnapshot,
      })),
      submissions:
        order.submissions?.map((x: any) => ({
          id: x.id,
          status: x.status,
          transactionReference: x.transactionReference,
          note: x.note,
          rejectionReason: x.rejectionReason,
          createdAt: x.createdAt,
          reviewedAt: x.reviewedAt,
        })) ?? [],
    };
  }
  async orders(studentUserId: string, query: PaginationQueryDto) {
    const where = { studentUserId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          receipt: true,
          submissions: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data: data.map((x) => this.orderDto(x)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
  async order(studentUserId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, studentUserId },
      include: {
        items: true,
        receipt: true,
        submissions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.orderDto(order);
  }
  async cancel(studentUserId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, studentUserId },
    });
    if (!order) throw new NotFoundException('Order not found');
    const cancelled = await this.prisma.order.updateMany({
      where: {
        id,
        studentUserId,
        status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED] },
      },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (cancelled.count !== 1)
      throw new ConflictException('Order cannot be cancelled');
    await this.prisma.couponReservation.updateMany({
      where: { orderId: id, status: 'RESERVED' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: studentUserId,
      action: 'ORDER_CANCELLED',
      targetType: 'Order',
      targetId: id,
    });
    return this.order(studentUserId, id);
  }
  async authorizeProofUpload(
    studentUserId: string,
    orderId: string,
    key: string,
    data: {
      filename: string;
      mimeType: string;
      transactionReference?: string;
      note?: string;
    },
  ) {
    this.assertIdempotencyKey(key);
    if (data.transactionReference && data.transactionReference.length > 200)
      throw new BadRequestException(
        'transactionReference must not exceed 200 characters',
      );
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, studentUserId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.paymentChannel !== PaymentChannel.MANUAL ||
      order.status !== OrderStatus.AWAITING_PAYMENT
    )
      throw new ConflictException(
        'Order cannot accept an initial payment proof',
      );
    return this.assets.authorizePaymentProof(
      { id: studentUserId, role: Role.STUDENT } as RequestUser,
      data,
    );
  }
  async authorizeResubmitProofUpload(
    studentUserId: string,
    orderId: string,
    submissionId: string,
    key: string,
    data: {
      filename: string;
      mimeType: string;
      transactionReference?: string;
      note?: string;
    },
  ) {
    this.assertIdempotencyKey(key);
    if (data.transactionReference && data.transactionReference.length > 200)
      throw new BadRequestException(
        'transactionReference must not exceed 200 characters',
      );
    const rejected = await this.prisma.manualPaymentSubmission.findFirst({
      where: {
        id: submissionId,
        orderId,
        status: ManualPaymentSubmissionStatus.REJECTED,
        order: { studentUserId, status: OrderStatus.REJECTED },
      },
    });
    if (!rejected)
      throw new ConflictException(
        'Payment submission is not eligible for resubmission',
      );
    return this.assets.authorizePaymentProof(
      { id: studentUserId, role: Role.STUDENT } as RequestUser,
      data,
    );
  }
  async submitProof(
    studentUserId: string,
    orderId: string,
    key: string,
    data: { assetId: string; transactionReference?: string; note?: string },
  ) {
    this.assertIdempotencyKey(key);
    if (!data.assetId?.trim())
      throw new BadRequestException('assetId is required');
    if (data.transactionReference && data.transactionReference.length > 200)
      throw new BadRequestException(
        'transactionReference must not exceed 200 characters',
      );
    const previous = await this.prisma.commerceIdempotencyKey.findUnique({
      where: {
        studentUserId_operation_key: {
          studentUserId,
          operation: `PROOF:${orderId}`,
          key,
        },
      },
    });
    if (previous) return { id: previous.resourceId };
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, studentUserId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.paymentChannel !== PaymentChannel.MANUAL ||
      order.status !== OrderStatus.AWAITING_PAYMENT
    )
      throw new ConflictException(
        'Order cannot accept an initial payment proof',
      );
    const proof = await this.paymentProof(studentUserId, data.assetId);
    try {
      const submission = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: orderId,
            studentUserId,
            status: OrderStatus.AWAITING_PAYMENT,
          },
          data: { status: OrderStatus.SUBMITTED },
        });
        if (claimed.count !== 1)
          throw new ConflictException(
            'Order cannot accept an initial payment proof',
          );
        const created = await tx.manualPaymentSubmission.create({
          data: {
            orderId,
            proofAssetId: proof.id,
            transactionReference: data.transactionReference?.trim() || null,
            note: data.note?.trim() || null,
          },
        });
        await tx.commerceIdempotencyKey.create({
          data: {
            studentUserId,
            operation: `PROOF:${orderId}`,
            key,
            resourceId: created.id,
          },
        });
        return created;
      });
      await this.audit.record({
        actorUserId: studentUserId,
        action: 'MANUAL_PAYMENT_SUBMITTED',
        targetType: 'ManualPaymentSubmission',
        targetId: submission.id,
        metadata: { orderId },
      });
      return { id: submission.id, status: submission.status };
    } catch (error: any) {
      if (error.code === 'P2002') {
        const saved = await this.prisma.commerceIdempotencyKey.findUnique({
          where: {
            studentUserId_operation_key: {
              studentUserId,
              operation: `PROOF:${orderId}`,
              key,
            },
          },
        });
        if (saved) return { id: saved.resourceId };
      }
      throw error;
    }
  }
  async resubmitProof(
    studentUserId: string,
    orderId: string,
    submissionId: string,
    key: string,
    data: { assetId: string; transactionReference?: string; note?: string },
  ) {
    this.assertIdempotencyKey(key);
    if (!data.assetId?.trim())
      throw new BadRequestException('assetId is required');
    if (data.transactionReference && data.transactionReference.length > 200)
      throw new BadRequestException(
        'transactionReference must not exceed 200 characters',
      );
    const operation = `RESUBMIT:${submissionId}`;
    const previous = await this.prisma.commerceIdempotencyKey.findUnique({
      where: { studentUserId_operation_key: { studentUserId, operation, key } },
    });
    if (previous)
      return {
        id: previous.resourceId,
        status: ManualPaymentSubmissionStatus.SUBMITTED,
      };
    const rejected = await this.prisma.manualPaymentSubmission.findFirst({
      where: {
        id: submissionId,
        orderId,
        status: ManualPaymentSubmissionStatus.REJECTED,
        order: { studentUserId, status: OrderStatus.REJECTED },
      },
    });
    if (!rejected)
      throw new ConflictException(
        'Payment submission is not eligible for resubmission',
      );
    const proof = await this.paymentProof(studentUserId, data.assetId);
    try {
      const submission = await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { id: orderId, studentUserId, status: OrderStatus.REJECTED },
            data: { status: OrderStatus.SUBMITTED },
          });
          if (claimed.count !== 1)
            throw new ConflictException(
              'Payment submission is not eligible for resubmission',
            );
          const current = await tx.manualPaymentSubmission.findFirst({
            where: {
              id: submissionId,
              orderId,
              status: ManualPaymentSubmissionStatus.REJECTED,
            },
          });
          if (!current)
            throw new ConflictException(
              'Payment submission is not eligible for resubmission',
            );
          const created = await tx.manualPaymentSubmission.create({
            data: {
              orderId,
              proofAssetId: proof.id,
              transactionReference: data.transactionReference?.trim() || null,
              note: data.note?.trim() || null,
            },
          });
          await tx.commerceIdempotencyKey.create({
            data: { studentUserId, operation, key, resourceId: created.id },
          });
          return created;
        },
        { isolationLevel: 'Serializable' },
      );
      await this.audit.record({
        actorUserId: studentUserId,
        action: 'MANUAL_PAYMENT_RESUBMITTED',
        targetType: 'ManualPaymentSubmission',
        targetId: submission.id,
        metadata: { orderId, replacedSubmissionId: submissionId },
      });
      return { id: submission.id, status: submission.status };
    } catch (error: any) {
      if (error.code === 'P2002') {
        const saved = await this.prisma.commerceIdempotencyKey.findUnique({
          where: {
            studentUserId_operation_key: { studentUserId, operation, key },
          },
        });
        if (saved)
          return {
            id: saved.resourceId,
            status: ManualPaymentSubmissionStatus.SUBMITTED,
          };
      }
      throw error;
    }
  }
  async methodsAdmin(actor: RequestUser, query: SearchPaginationQueryDto) {
    this.admin(actor);
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.manualPaymentMethod,
      target: 'manualPaymentMethod',
      q: query.q,
      orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      where: {},
      page: query.page,
      limit: query.limit,
    });
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async createMethod(actor: RequestUser, dto: CreatePaymentMethodDto) {
    this.admin(actor);
    const method = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122401)`;
      const max = await tx.manualPaymentMethod.aggregate({
        _max: { sortOrder: true },
      });
      return tx.manualPaymentMethod.create({
        data: {
          ...dto,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          createdById: actor.id,
        },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'MANUAL_PAYMENT_METHOD_CREATED',
      targetType: 'ManualPaymentMethod',
      targetId: method.id,
    });
    return method;
  }
  async updateMethod(
    actor: RequestUser,
    id: string,
    dto: UpdatePaymentMethodDto,
  ) {
    this.admin(actor);
    const method = await this.prisma.manualPaymentMethod.update({
      where: { id },
      data: dto,
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'MANUAL_PAYMENT_METHOD_UPDATED',
      targetType: 'ManualPaymentMethod',
      targetId: id,
    });
    return method;
  }
  async reorderMethods(actor: RequestUser, ids: string[]) {
    this.admin(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122401)`;
      const methods = await tx.manualPaymentMethod.findMany({
        select: { id: true, sortOrder: true },
      });
      if (
        ids.length !== methods.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !methods.some((method) => method.id === id))
      )
        throw new BadRequestException(
          'Provide every payment method exactly once',
        );
      const temporaryOrderStart =
        Math.max(0, ...methods.map((method) => method.sortOrder)) + 1;
      for (const [index, id] of ids.entries())
        await tx.manualPaymentMethod.update({
          where: { id },
          data: { sortOrder: temporaryOrderStart + index },
        });
      for (const [index, id] of ids.entries())
        await tx.manualPaymentMethod.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
    });
    return {
      data: await this.prisma.manualPaymentMethod.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    };
  }
  async submissions(actor: RequestUser, query: PaymentSubmissionQueryDto) {
    this.admin(actor);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.studentUserId
        ? { order: { studentUserId: query.studentUserId } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.manualPaymentSubmission.findMany({
        where,
        include: { order: { include: { student: true, items: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.manualPaymentSubmission.count({ where }),
    ]);
    return {
      data: data.map((x) => ({
        id: x.id,
        status: x.status,
        transactionReference: x.transactionReference,
        orderId: x.orderId,
        orderStatus: x.order.status,
        studentUserId: x.order.studentUserId,
        studentName: x.order.student.fullName,
        total: { amountMinor: x.order.totalMinor, currency: x.order.currency },
        createdAt: x.createdAt,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
  async submission(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.prisma.manualPaymentSubmission.findUnique({
      where: { id },
      include: { proofAsset: true, order: { include: { items: true } } },
    });
    if (!item) throw new NotFoundException('Payment submission not found');
    return {
      id: item.id,
      status: item.status,
      transactionReference: item.transactionReference,
      note: item.note,
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
      order: this.orderDto({ ...item.order, submissions: [] }),
      proof: {
        id: item.proofAssetId,
        filename: item.proofAsset.filename,
        mimeType: item.proofAsset.mimeType,
        ...this.assets.protectedAccess(item.proofAsset),
      },
    };
  }
  async approve(actor: RequestUser, id: string) {
    this.admin(actor);
    const now = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        const submission = await tx.manualPaymentSubmission.findUnique({
          where: { id },
          include: { order: { include: { items: true } } },
        });
        if (!submission)
          throw new NotFoundException('Payment submission not found');
        if (submission.status === ManualPaymentSubmissionStatus.APPROVED)
          return submission;
        const claimed = await tx.manualPaymentSubmission.updateMany({
          where: { id, status: ManualPaymentSubmissionStatus.SUBMITTED },
          data: {
            status: ManualPaymentSubmissionStatus.APPROVED,
            reviewedById: actor.id,
            reviewedAt: now,
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Payment submission cannot be approved');
        await this.fulfilment!.fulfil(tx, {
          orderId: submission.orderId,
          actorUserId: actor.id,
        });
        await this.audit.recordWithClient(tx, {
          actorUserId: actor.id,
          action: 'MANUAL_PAYMENT_APPROVED',
          targetType: 'ManualPaymentSubmission',
          targetId: id,
          metadata: { orderId: submission.orderId },
        });
        return submission;
      },
      { isolationLevel: 'Serializable' },
    );
    return { id, status: ManualPaymentSubmissionStatus.APPROVED };
  }
  async reject(actor: RequestUser, id: string, dto: RejectPaymentDto) {
    this.admin(actor);
    const now = new Date();
    const submission = await this.prisma.$transaction(async (tx) => {
      const found = await tx.manualPaymentSubmission.findUnique({
        where: { id },
      });
      if (!found) throw new NotFoundException('Payment submission not found');
      const claimed = await tx.manualPaymentSubmission.updateMany({
        where: { id, status: ManualPaymentSubmissionStatus.SUBMITTED },
        data: {
          status: ManualPaymentSubmissionStatus.REJECTED,
          reviewedById: actor.id,
          reviewedAt: now,
          rejectionReason: dto.rejectionReason.trim(),
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Payment submission cannot be rejected');
      const orderClaimed = await tx.order.updateMany({
        where: { id: found.orderId, status: OrderStatus.SUBMITTED },
        data: { status: OrderStatus.REJECTED },
      });
      if (orderClaimed.count !== 1)
        throw new ConflictException('Payment submission cannot be rejected');
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'MANUAL_PAYMENT_REJECTED',
        targetType: 'ManualPaymentSubmission',
        targetId: id,
      });
      return { ...found, status: ManualPaymentSubmissionStatus.REJECTED };
    });
    return { id: submission.id, status: submission.status };
  }

  async createPaymobAttempt(
    studentUserId: string,
    orderId: string,
    key: string,
  ) {
    this.assertIdempotencyKey(key);
    const operation = `PAYMOB_ATTEMPT:${orderId}`;
    const saved = await this.prisma.commerceIdempotencyKey.findUnique({
      where: { studentUserId_operation_key: { studentUserId, operation, key } },
    });
    if (saved) {
      const attempt = await this.prisma.paymentAttempt.findUnique({
        where: { id: saved.resourceId },
      });
      if (attempt)
        return {
          id: attempt.id,
          status: attempt.status,
          checkoutUrl: attempt.checkoutUrl,
          expiresAt: attempt.expiresAt,
        };
    }
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        studentUserId,
        paymentChannel: PaymentChannel.PAYMOB,
      },
      include: {
        items: true,
        student: {
          select: {
            fullName: true,
            parentPhoneNormalized: true,
            user: { select: { loginIdentifier: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Paymob order not found');
    if (
      order.status !== OrderStatus.AWAITING_PAYMENT ||
      (order.paymentExpiresAt && order.paymentExpiresAt <= new Date())
    )
      throw new ConflictException('Order cannot start a Paymob payment');
    const attempt = await this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.paymentAttempt.aggregate({
          where: { orderId },
          _max: { attemptNumber: true },
        });
        const attemptNumber = (previous._max.attemptNumber ?? 0) + 1;
        const merchantReference = `${order.id}:${attemptNumber}`;
        const created = await tx.paymentAttempt.create({
          data: {
            orderId,
            channel: PaymentChannel.PAYMOB,
            status: PaymentAttemptStatus.INITIATED,
            attemptNumber,
            merchantReference,
            expiresAt: order.paymentExpiresAt,
          },
        });
        await tx.commerceIdempotencyKey.create({
          data: { studentUserId, operation, key, resourceId: created.id },
        });
        return created;
      },
      { isolationLevel: 'Serializable' },
    );
    try {
      const intent = await this.paymob!.createIntention({
        merchantReference: attempt.merchantReference,
        amountMinor: order.totalMinor,
        items: order.items.map((item) => ({
          title: item.titleSnapshot,
          amountMinor: item.priceMinor,
        })),
        customer: {
          fullName: order.student.fullName,
          phone: order.student.parentPhoneNormalized,
          email: order.student.user.loginIdentifier,
        },
      });
      const updated = await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.PENDING,
          providerOrderId: intent.providerOrderId,
          checkoutUrl: intent.checkoutUrl,
          providerPayload: { intentionId: intent.providerOrderId },
        },
      });
      await this.audit.record({
        actorUserId: studentUserId,
        action: 'PAYMOB_ATTEMPT_CREATED',
        targetType: 'PaymentAttempt',
        targetId: attempt.id,
        metadata: { orderId },
      });
      return {
        id: updated.id,
        status: updated.status,
        checkoutUrl: updated.checkoutUrl,
        expiresAt: updated.expiresAt,
      };
    } catch (error) {
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: PaymentAttemptStatus.FAILED,
          completedAt: new Date(),
          failureMessage:
            error instanceof Error
              ? error.message
              : 'Paymob intention creation failed',
        },
      });
      throw error;
    }
  }

  async paymobWebhook(payload: any, hmac: string) {
    const transaction = payload?.obj;
    const providerTransactionId = transaction?.id
      ? String(transaction.id)
      : 'missing';
    const merchantReference =
      transaction?.order?.merchant_order_id ??
      transaction?.order?.special_reference ??
      null;
    const verified = this.paymob!.verifyTransactionHmac(transaction, hmac);
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload ?? {}))
      .digest('hex');
    const externalTransactionId = verified
      ? providerTransactionId
      : `invalid:${providerTransactionId}:${payloadHash}`;
    try {
      await this.prisma.paymobWebhookEvent.create({
        data: {
          externalTransactionId,
          merchantReference,
          verified,
          payloadHash,
          payload: transaction ?? null,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const existing = await this.prisma.paymobWebhookEvent.findUnique({
          where: { externalTransactionId },
          select: { verified: true },
        });
        return { accepted: existing?.verified ?? false, duplicate: true };
      }
      throw error;
    }
    if (!verified) return { accepted: false, duplicate: false };
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const event = await tx.paymobWebhookEvent.findUnique({
            where: { externalTransactionId },
          });
          const attempt = merchantReference
            ? await tx.paymentAttempt.findUnique({
                where: { merchantReference },
              })
            : null;
          if (!attempt)
            throw new NotFoundException('Paymob payment attempt not found');
          const success =
            transaction.success === true && transaction.pending === false;
          const status = success
            ? PaymentAttemptStatus.PAID
            : transaction.pending
              ? PaymentAttemptStatus.PENDING
              : PaymentAttemptStatus.DECLINED;
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status,
              providerTransactionId: String(transaction.id),
              completedAt: success || !transaction.pending ? new Date() : null,
              providerPayload: {
                transactionId: transaction.id,
                success: transaction.success,
                pending: transaction.pending,
                errorOccurred: transaction.error_occured,
              },
            },
          });
          if (success)
            await this.fulfilment!.fulfil(tx, {
              orderId: attempt.orderId,
              paymentAttemptId: attempt.id,
            });
          await tx.paymobWebhookEvent.update({
            where: { id: event!.id },
            data: { processedAt: new Date() },
          });
          return { success, orderId: attempt.orderId };
        },
        { isolationLevel: 'Serializable' },
      );
      return { accepted: true, duplicate: false, ...result };
    } catch (error) {
      await this.prisma.paymobWebhookEvent.update({
        where: { externalTransactionId },
        data: {
          processingError:
            error instanceof Error
              ? error.message
              : 'Webhook processing failed',
        },
      });
      throw error;
    }
  }

  private async validatePromotionTargets(
    targets: Array<{ courseId?: string; chapterId?: string }> | undefined,
    appliesToAll: boolean,
  ) {
    const values = targets ?? [];
    if (appliesToAll && values.length)
      throw new BadRequestException(
        'All-products promotions cannot have selected targets',
      );
    if (!appliesToAll && !values.length)
      throw new BadRequestException(
        'Select at least one course or chapter, or apply to all products',
      );
    for (const target of values) {
      if (Boolean(target.courseId) === Boolean(target.chapterId))
        throw new BadRequestException(
          'Each promotion target must be one course or chapter',
        );
      if (
        target.courseId &&
        !(await this.prisma.course.findUnique({
          where: { id: target.courseId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Course target not found');
      if (
        target.chapterId &&
        !(await this.prisma.chapter.findUnique({
          where: { id: target.chapterId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Chapter target not found');
    }
    return values;
  }

  private validatePromotion(dto: {
    startsAt: Date;
    endsAt: Date;
    amount: number;
    kind: any;
  }) {
    if (dto.endsAt <= dto.startsAt)
      throw new BadRequestException('endsAt must be after startsAt');
    if (dto.kind === 'PERCENTAGE' && dto.amount > 10_000)
      throw new BadRequestException('Percentage cannot exceed 100%');
  }

  async createCampaign(actor: RequestUser, dto: CreateDiscountCampaignDto) {
    this.admin(actor);
    this.validatePromotion(dto);
    const targets = await this.validatePromotionTargets(
      dto.targets,
      dto.appliesToAll ?? false,
    );
    const campaign = await this.prisma.discountCampaign.create({
      data: {
        name: dto.name.trim(),
        note: dto.note?.trim() || null,
        kind: dto.kind,
        amount: dto.amount,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        priority: dto.priority ?? 0,
        appliesToAll: dto.appliesToAll ?? false,
        createdById: actor.id,
        updatedById: actor.id,
        targets: {
          create: targets.map((target) => ({
            courseId: target.courseId,
            chapterId: target.chapterId,
          })),
        },
      },
      include: { targets: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'DISCOUNT_CAMPAIGN_CREATED',
      targetType: 'DiscountCampaign',
      targetId: campaign.id,
    });
    return campaign;
  }
  async updateCampaign(
    actor: RequestUser,
    id: string,
    dto: UpdateDiscountCampaignDto,
  ) {
    this.admin(actor);
    const current = await this.prisma.discountCampaign.findUnique({
      where: { id },
      include: { targets: true },
    });
    if (!current) throw new NotFoundException('Discount campaign not found');
    const kind = dto.kind ?? current.kind;
    const amount = dto.amount ?? current.amount;
    const startsAt = dto.startsAt ?? current.startsAt;
    const endsAt = dto.endsAt ?? current.endsAt;
    this.validatePromotion({ kind, amount, startsAt, endsAt });
    const appliesToAll = dto.appliesToAll ?? current.appliesToAll;
    const targets =
      dto.targets === undefined
        ? current.targets
        : await this.validatePromotionTargets(dto.targets, appliesToAll);
    if (dto.targets === undefined && appliesToAll && targets.length)
      throw new BadRequestException(
        'All-products promotions cannot have selected targets',
      );
    const campaign = await this.prisma.$transaction(async (tx) => {
      if (dto.targets !== undefined) {
        await tx.discountCampaignTarget.deleteMany({
          where: { campaignId: id },
        });
      }
      return tx.discountCampaign.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.appliesToAll !== undefined ? { appliesToAll } : {}),
          updatedById: actor.id,
          ...(dto.targets !== undefined
            ? {
                targets: {
                  create: targets.map((target: any) => ({
                    courseId: target.courseId,
                    chapterId: target.chapterId,
                  })),
                },
              }
            : {}),
        },
        include: { targets: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'DISCOUNT_CAMPAIGN_UPDATED',
      targetType: 'DiscountCampaign',
      targetId: id,
    });
    return campaign;
  }
  async campaigns(actor: RequestUser, query: PaginationQueryDto) {
    this.admin(actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.discountCampaign.findMany({
        include: { targets: true },
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.discountCampaign.count(),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async setCampaignActive(actor: RequestUser, id: string, isActive: boolean) {
    this.admin(actor);
    const value = await this.prisma.discountCampaign.update({
      where: { id },
      data: { isActive, updatedById: actor.id },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: isActive
        ? 'DISCOUNT_CAMPAIGN_ACTIVATED'
        : 'DISCOUNT_CAMPAIGN_DEACTIVATED',
      targetType: 'DiscountCampaign',
      targetId: id,
    });
    return value;
  }

  async createCoupon(actor: RequestUser, dto: CreateCouponDto) {
    this.admin(actor);
    this.validatePromotion(dto);
    const targets = await this.validatePromotionTargets(
      dto.targets,
      dto.appliesToAll ?? false,
    );
    const code = dto.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,80}$/.test(code))
      throw new BadRequestException(
        'Coupon code must use letters, numbers, hyphens, or underscores',
      );
    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        name: dto.name.trim(),
        kind: dto.kind,
        amount: dto.amount,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        appliesToAll: dto.appliesToAll ?? false,
        minimumOrderMinor: dto.minimumOrderMinor ?? 0,
        maximumDiscountMinor: dto.maximumDiscountMinor,
        usageLimit: dto.usageLimit,
        perStudentUsageLimit: dto.perStudentUsageLimit,
        createdById: actor.id,
        updatedById: actor.id,
        targets: {
          create: targets.map((target) => ({
            courseId: target.courseId,
            chapterId: target.chapterId,
          })),
        },
      },
      include: { targets: true },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'COUPON_CREATED',
      targetType: 'Coupon',
      targetId: coupon.id,
    });
    return coupon;
  }
  async updateCoupon(actor: RequestUser, id: string, dto: UpdateCouponDto) {
    this.admin(actor);
    const current = await this.prisma.coupon.findUnique({
      where: { id },
      include: { targets: true },
    });
    if (!current) throw new NotFoundException('Coupon not found');
    const kind = dto.kind ?? current.kind;
    const amount = dto.amount ?? current.amount;
    const startsAt = dto.startsAt ?? current.startsAt;
    const endsAt = dto.endsAt ?? current.endsAt;
    this.validatePromotion({ kind, amount, startsAt, endsAt });
    const appliesToAll = dto.appliesToAll ?? current.appliesToAll;
    const targets =
      dto.targets === undefined
        ? current.targets
        : await this.validatePromotionTargets(dto.targets, appliesToAll);
    if (dto.targets === undefined && appliesToAll && targets.length)
      throw new BadRequestException(
        'All-products coupons cannot have selected targets',
      );
    const code = dto.code?.trim().toUpperCase();
    if (code && !/^[A-Z0-9_-]{2,80}$/.test(code))
      throw new BadRequestException(
        'Coupon code must use letters, numbers, hyphens, or underscores',
      );
    const coupon = await this.prisma.$transaction(async (tx) => {
      if (dto.targets !== undefined)
        await tx.couponTarget.deleteMany({ where: { couponId: id } });
      return tx.coupon.update({
        where: { id },
        data: {
          ...(code ? { code } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
          ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
          ...(dto.appliesToAll !== undefined ? { appliesToAll } : {}),
          ...(dto.minimumOrderMinor !== undefined
            ? { minimumOrderMinor: dto.minimumOrderMinor }
            : {}),
          ...(dto.maximumDiscountMinor !== undefined
            ? { maximumDiscountMinor: dto.maximumDiscountMinor }
            : {}),
          ...(dto.usageLimit !== undefined
            ? { usageLimit: dto.usageLimit }
            : {}),
          ...(dto.perStudentUsageLimit !== undefined
            ? { perStudentUsageLimit: dto.perStudentUsageLimit }
            : {}),
          updatedById: actor.id,
          ...(dto.targets !== undefined
            ? {
                targets: {
                  create: targets.map((target: any) => ({
                    courseId: target.courseId,
                    chapterId: target.chapterId,
                  })),
                },
              }
            : {}),
        },
        include: { targets: true },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'COUPON_UPDATED',
      targetType: 'Coupon',
      targetId: id,
    });
    return coupon;
  }
  async coupons(actor: RequestUser, query: PaginationQueryDto) {
    this.admin(actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        include: { targets: true, _count: { select: { reservations: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.coupon.count(),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async setCouponActive(actor: RequestUser, id: string, isActive: boolean) {
    this.admin(actor);
    const value = await this.prisma.coupon.update({
      where: { id },
      data: { isActive, updatedById: actor.id },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: isActive ? 'COUPON_ACTIVATED' : 'COUPON_DEACTIVATED',
      targetType: 'Coupon',
      targetId: id,
    });
    return value;
  }
}
