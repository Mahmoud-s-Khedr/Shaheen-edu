import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, OrderItem } from '@prisma/client';
import type { PriceQuote } from '../commerce/pricing.service';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StudentCreditService } from './student-credit.service';
import {
  activePolicy,
  DEFAULT_REWARDS_SETTINGS,
  eligibleTarget,
} from './rewards-policy';
import { assertSuperAdmin } from '../../common/authorization/admin-authorization';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  PaginationQueryDto,
  toPaginationMeta,
} from '../../common/dto/pagination-query.dto';
import type {
  ReviewStudentReferralDto,
  PurchaseRewardPolicyDto,
  SaveStudentRewardsSettingsDto,
} from './dto/student-rewards.dto';
import { allocateBundleRevenue } from '../commerce/bundle-allocation';

type RewardOrder = Prisma.OrderGetPayload<{
  include: { items: true; salesOfferPurchases: true };
}>;
type RewardsSnapshot = {
  version: number;
  config: SaveStudentRewardsSettingsDto;
  checkoutAt: string;
  referralId: string | null;
};
type OfferRewardSnapshot = {
  firstPurchaseEligible?: boolean;
  creditRewardMinor?: number;
};
type EligibilitySnapshot = {
  orderItemIds: string[];
  minimumPaymentMinor: number;
  reverseOnAnyRefund?: boolean;
};
type RefundInput = {
  id: string;
  orderId: string;
  items: Array<{ orderItemId: string; creditReturnMinor?: number }>;
};

@Injectable()
export class StudentRewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: StudentCreditService,
    private readonly audit: AuditService,
  ) {}
  // Serializes eligibility claims and global referral limits across students.
  async lock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122403)`;
  }
  async settings(tx: Prisma.TransactionClient = this.prisma) {
    const row = await tx.studentRewardsSettings.findUnique({
      where: { id: 'default' },
    });
    return {
      version: row?.version ?? 0,
      config: (row?.config ??
        DEFAULT_REWARDS_SETTINGS) as unknown as SaveStudentRewardsSettingsDto,
    };
  }
  async saveSettings(actor: RequestUser, dto: SaveStudentRewardsSettingsDto) {
    assertSuperAdmin(actor);
    for (const policy of [dto.firstPurchase, dto.referral]) {
      if (policy.startsAt && policy.endsAt && policy.endsAt <= policy.startsAt)
        throw new BadRequestException('Program end must be after start');
      if (
        policy.enabled &&
        !policy.rewardMinor &&
        !('invitedRewardMinor' in policy && policy.invitedRewardMinor)
      )
        throw new BadRequestException(
          'An enabled reward program needs a reward amount',
        );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const row = await tx.studentRewardsSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          config: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonObject,
          updatedById: actor.id,
        },
        update: {
          config: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonObject,
          version: { increment: 1 },
          updatedById: actor.id,
        },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_REWARDS_SETTINGS_UPDATED',
        targetType: 'StudentRewardsSettings',
        targetId: row.id,
        metadata: { version: row.version, config: row.config },
      });
      return row;
    });
  }
  async quoteCredit(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    quote: PriceQuote,
    requestedMinor = 0,
  ) {
    const settings = await this.settings(tx);
    if (!Number.isSafeInteger(requestedMinor) || requestedMinor < 0)
      throw new BadRequestException('Credit must be a non-negative integer');
    const policy = settings.config.credit;
    if (!policy.enabled) {
      if (requestedMinor)
        throw new ConflictException('Student credit spending is disabled');
      return {
        creditAppliedMinor: 0,
        paymentDueMinor: quote.totalMinor,
        maximumCreditMinor: 0,
        creditShares: new Map<string, number>(),
        settings,
      };
    }
    const items = quote.items.flatMap((item, index) =>
      eligibleTarget(policy, {
        ...item,
        ...(item.targetType === 'BUNDLE'
          ? { salesOfferPurchaseId: 'preview' }
          : {}),
      }) && item.finalPriceMinor > 0
        ? [{ key: String(index), weightMinor: item.finalPriceMinor }]
        : [],
    );
    const subtotal = items.reduce((sum, item) => sum + item.weightMinor, 0);
    const balance = await this.credit.balanceWithClient(tx, studentUserId);
    const maximum = balance.debtMinor
      ? 0
      : Math.min(
          balance.availableMinor,
          Math.floor((subtotal * policy.maximumUsageBps) / 10000),
          policy.maximumUsageMinor ?? 2147483647,
        );
    if (requestedMinor > maximum)
      throw new ConflictException(
        'Requested credit exceeds the available balance or usage limit',
      );
    return {
      maximumCreditMinor: maximum,
      creditAppliedMinor: requestedMinor,
      paymentDueMinor: quote.totalMinor - requestedMinor,
      creditShares: requestedMinor
        ? allocateBundleRevenue(requestedMinor, items)
        : new Map<string, number>(),
      settings,
    };
  }
  async snapshot(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    settings: { version: number; config: SaveStudentRewardsSettingsDto },
    partnerReferral: boolean,
    studentReferralCode?: string,
    persist = false,
  ) {
    if (partnerReferral && studentReferralCode)
      throw new ConflictException(
        'An order cannot use both student and partner referrals',
      );
    const selected = studentReferralCode
      ? await this.attribute(tx, studentUserId, studentReferralCode, persist)
      : null;
    const attribution = await tx.studentReferral.findUnique({
      where: { invitedStudentId: studentUserId },
      include: { inviteCode: true },
    });
    if (
      partnerReferral &&
      attribution &&
      activePolicy(settings.config.referral, new Date()) &&
      attribution.status === 'ACTIVE' &&
      attribution.inviteCode.isActive
    )
      throw new ConflictException(
        'An order cannot use both student and partner referrals',
      );
    return {
      ...settings,
      checkoutAt: new Date().toISOString(),
      studentReferral: selected
        ? {
            code: studentReferralCode!.trim().toUpperCase(),
            status: selected.status,
          }
        : attribution &&
            activePolicy(settings.config.referral, new Date()) &&
            attribution.inviteCode.isActive
          ? { code: attribution.inviteCode.code, status: attribution.status }
          : null,
      referralId:
        !partnerReferral &&
        attribution?.status === 'ACTIVE' &&
        attribution.inviteCode.isActive
          ? attribution.id
          : null,
    };
  }
  async invite(studentUserId: string) {
    const settings = await this.settings();
    if (!activePolicy(settings.config.referral, new Date()))
      throw new ConflictException('Student referral program is inactive');
    const row = await this.prisma.studentInviteCode.upsert({
      where: { studentUserId },
      create: {
        studentUserId,
        code: `STU${randomBytes(12).toString('hex').toUpperCase()}`,
      },
      update: {},
    });
    return { code: row.code, isActive: row.isActive };
  }
  async attribute(
    tx: Prisma.TransactionClient,
    invitedStudentId: string,
    code: string,
    persist = true,
  ) {
    if (persist) await this.lock(tx);
    const settings = await this.settings(tx);
    if (!activePolicy(settings.config.referral, new Date()))
      throw new BadRequestException('Student referral program is inactive');
    const invite = await tx.studentInviteCode.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { student: { include: { user: true } } },
    });
    if (
      !invite?.isActive ||
      invite.student.user.status !== 'ACTIVE' ||
      invite.student.user.deletedAt
    )
      throw new BadRequestException('Invalid student referral code');
    if (invite.studentUserId === invitedStudentId)
      throw new BadRequestException('Self-referrals are not allowed');
    const prior = await tx.studentReferral.findUnique({
      where: { invitedStudentId },
    });
    if (prior) {
      if (prior.referrerStudentId !== invite.studentUserId)
        throw new ConflictException(
          'A different student referrer is already assigned',
        );
      return prior;
    }
    const student = await tx.studentProfile.findUniqueOrThrow({
      where: { userId: invitedStudentId },
    });
    const suspicious =
      student.parentPhoneNormalized === invite.student.parentPhoneNormalized;
    const data = {
      invitedStudentId,
      referrerStudentId: invite.studentUserId,
      codeOwnerId: invite.studentUserId,
      reviewReason: suspicious ? 'SHARED_PARENT_PHONE' : null,
      status: suspicious ? 'SUSPENDED' : 'ACTIVE',
    };
    if (!persist) return { ...data, id: null };
    return tx.studentReferral.create({ data });
  }

  async ownReferrals(studentUserId: string, query: PaginationQueryDto) {
    const where = { referrerStudentId: studentUserId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentReferral.findMany({
        where,
        select: { id: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentReferral.count({ where }),
    ]);
    return {
      data: rows,
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
  async listReferrals(actor: RequestUser, query: PaginationQueryDto) {
    assertSuperAdmin(actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentReferral.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentReferral.count(),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async review(actor: RequestUser, id: string, dto: ReviewStudentReferralDto) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      if (!(await tx.studentReferral.findUnique({ where: { id } })))
        throw new NotFoundException('Student referral not found');
      const row = await tx.studentReferral.update({
        where: { id },
        data: {
          status: dto.status,
          reviewNote: dto.note.trim(),
          reviewedById: actor.id,
        },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_REFERRAL_REVIEWED',
        targetType: 'StudentReferral',
        targetId: id,
        metadata: { status: dto.status, note: dto.note.trim() },
      });
      return row;
    });
  }
  async setInviteStatus(
    actor: RequestUser,
    studentUserId: string,
    isActive: boolean,
    reason: string,
  ) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      if (
        !(await tx.studentInviteCode.findUnique({ where: { studentUserId } }))
      )
        throw new NotFoundException('Student invite code not found');
      const row = await tx.studentInviteCode.update({
        where: { studentUserId },
        data: { isActive },
      });
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_INVITE_STATUS_UPDATED',
        targetType: 'StudentInviteCode',
        targetId: studentUserId,
        metadata: { isActive, reason },
      });
      return row;
    });
  }
  private enrich(order: RewardOrder) {
    return order.items.map((item) => {
      const bundle = order.salesOfferPurchases?.find(
        (p) => p.id === item.salesOfferPurchaseId,
      );
      return {
        ...item,
        salesOfferId: bundle?.salesOfferId,
        firstPurchaseEligible:
          (bundle?.snapshot as OfferRewardSnapshot | undefined)
            ?.firstPurchaseEligible ?? false,
      };
    });
  }
  private qualifyingItems(
    order: RewardOrder,
    policy: PurchaseRewardPolicyDto,
    first: boolean,
  ) {
    return this.enrich(order).filter(
      (item) =>
        eligibleTarget(policy, item) &&
        (!first || !item.salesOfferPurchaseId || item.firstPurchaseEligible),
    );
  }
  private paid(items: OrderItem[]) {
    return items.reduce(
      (sum, item) => sum + item.priceMinor - (item.creditAppliedMinor ?? 0),
      0,
    );
  }
  private async historicalQualifying(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    orderId: string,
    policy: PurchaseRewardPolicyDto,
    first: boolean,
  ) {
    const orders = await tx.order.findMany({
      where: {
        studentUserId,
        id: { not: orderId },
        status: 'APPROVED',
      },
      include: {
        items: {
          include: { refundRequestItem: { include: { refundRequest: true } } },
        },
        salesOfferPurchases: true,
      },
    });
    return orders.some(
      (order) =>
        this.paid(
          this.qualifyingItems(
            {
              ...order,
              items: order.items.filter(
                (item) =>
                  item.refundRequestItem?.refundRequest?.status !== 'APPROVED',
              ),
            },
            policy,
            first,
          ),
        ) >= policy.minimumPaymentMinor,
    );
  }
  async award(tx: Prisma.TransactionClient, order: RewardOrder) {
    const snapshot = order.rewardsSnapshot as unknown as RewardsSnapshot | null;
    if (!snapshot) return;
    const policy = snapshot.config;
    const at = new Date(snapshot.checkoutAt);
    const expiresAt = policy.credit.expiryDays
      ? new Date(Date.now() + policy.credit.expiryDays * 86400000)
      : null;
    const give = async (
      studentUserId: string,
      key: string,
      kind: string,
      amountMinor: number,
      eligibility: EligibilitySnapshot,
    ) => {
      if (
        !amountMinor ||
        (await tx.studentRewardAward.findUnique({ where: { key } }))
      )
        return;
      const grantSourceKey = `reward:${key}`;
      await tx.studentRewardAward.create({
        data: {
          studentUserId,
          key,
          kind,
          orderId: order.id,
          amountMinor,
          grantSourceKey,
          eligibilitySnapshot: JSON.parse(
            JSON.stringify(eligibility),
          ) as Prisma.InputJsonObject,
        },
      });
      await this.credit.grant(tx, {
        studentUserId,
        sourceKey: grantSourceKey,
        amountMinor,
        reason: kind,
        orderId: order.id,
        expiresAt,
      });
    };
    const firstItems = this.qualifyingItems(order, policy.firstPurchase, true);
    if (
      activePolicy(policy.firstPurchase, at) &&
      this.paid(firstItems) >= policy.firstPurchase.minimumPaymentMinor &&
      !(await this.historicalQualifying(
        tx,
        order.studentUserId,
        order.id,
        policy.firstPurchase,
        true,
      ))
    ) {
      await give(
        order.studentUserId,
        `first:${order.studentUserId}`,
        'FIRST_PURCHASE',
        policy.firstPurchase.rewardMinor,
        {
          orderItemIds: firstItems.map((i) => i.id),
          minimumPaymentMinor: policy.firstPurchase.minimumPaymentMinor,
        },
      );
    }
    if (snapshot.referralId && activePolicy(policy.referral, at)) {
      const referral = await tx.studentReferral.findUnique({
        where: { id: snapshot.referralId },
        include: {
          inviteCode: true,
          referrerStudent: { include: { user: true } },
        },
      });
      const items = this.qualifyingItems(order, policy.referral, false);
      if (
        referral?.status === 'ACTIVE' &&
        referral.inviteCode.isActive &&
        referral.referrerStudent.user.status === 'ACTIVE' &&
        !referral.referrerStudent.user.deletedAt &&
        this.paid(items) >= policy.referral.minimumPaymentMinor &&
        !(await this.historicalQualifying(
          tx,
          order.studentUserId,
          order.id,
          policy.referral,
          false,
        ))
      ) {
        const count = await tx.studentRewardAward.count({
          where: { kind: 'REFERRER' },
        });
        const personal = await tx.studentRewardAward.count({
          where: {
            kind: 'REFERRER',
            studentUserId: referral.referrerStudentId,
          },
        });
        if (
          (policy.referral.rewardLimit == null ||
            count < policy.referral.rewardLimit) &&
          (policy.referral.perReferrerLimit == null ||
            personal < policy.referral.perReferrerLimit)
        ) {
          const eligibility = {
            orderItemIds: items.map((i) => i.id),
            minimumPaymentMinor: policy.referral.minimumPaymentMinor,
          };
          // A zero referrer amount still needs a claim to enforce limits and once-only rules.
          const key = `referrer:${referral.id}`;
          if (!(await tx.studentRewardAward.findUnique({ where: { key } }))) {
            if (policy.referral.rewardMinor)
              await give(
                referral.referrerStudentId,
                key,
                'REFERRER',
                policy.referral.rewardMinor,
                eligibility,
              );
            else
              await tx.studentRewardAward.create({
                data: {
                  key,
                  studentUserId: referral.referrerStudentId,
                  kind: 'REFERRER',
                  orderId: order.id,
                  amountMinor: 0,
                  grantSourceKey: `reward:${key}`,
                  eligibilitySnapshot: JSON.parse(
                    JSON.stringify(eligibility),
                  ) as Prisma.InputJsonObject,
                },
              });
            await give(
              order.studentUserId,
              `invited:${referral.id}`,
              'INVITED_STUDENT',
              policy.referral.invitedRewardMinor,
              eligibility,
            );
          }
        }
      }
    }
    for (const purchase of order.salesOfferPurchases ?? []) {
      const amount =
        (purchase.snapshot as OfferRewardSnapshot)?.creditRewardMinor ?? 0;
      await give(
        order.studentUserId,
        `bundle:${purchase.id}`,
        'BUNDLE',
        amount,
        {
          orderItemIds: order.items
            .filter((i) => i.salesOfferPurchaseId === purchase.id)
            .map((i) => i.id),
          minimumPaymentMinor: 0,
          reverseOnAnyRefund: true,
        },
      );
    }
  }
  async refund(tx: Prisma.TransactionClient, request: RefundInput) {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: request.orderId },
      include: {
        items: {
          include: { refundRequestItem: { include: { refundRequest: true } } },
        },
        rewardAwards: true,
      },
    });
    const currentIds = new Set(request.items.map((item) => item.orderItemId));
    const refundedIds = new Set(
      order.items
        .filter(
          (item) =>
            currentIds.has(item.id) ||
            item.refundRequestItem?.refundRequest?.status === 'APPROVED',
        )
        .map((item) => item.id),
    );
    const students = [
      ...new Set([
        order.studentUserId,
        ...order.rewardAwards.map((a) => a.studentUserId),
      ]),
    ].sort();
    for (const id of students) await this.credit.lock(tx, id);
    const returned = request.items.reduce(
      (sum, item) => sum + (item.creditReturnMinor ?? 0),
      0,
    );
    if (returned)
      await this.credit.returnSpent(tx, order.id, request.id, returned);
    for (const award of order.rewardAwards) {
      if (award.reversedAt) continue;
      const eligibility =
        award.eligibilitySnapshot as unknown as EligibilitySnapshot;
      const affected = eligibility.orderItemIds.some((id: string) =>
        refundedIds.has(id),
      );
      const remaining = order.items.filter(
        (item) =>
          eligibility.orderItemIds.includes(item.id) &&
          !refundedIds.has(item.id),
      );
      if (
        affected &&
        (eligibility.reverseOnAnyRefund ||
          this.paid(remaining) < eligibility.minimumPaymentMinor)
      ) {
        await this.credit.reverseGrant(tx, award.grantSourceKey, order.id);
        await tx.studentRewardAward.update({
          where: { id: award.id },
          data: { reversedAt: new Date() },
        });
      }
    }
  }
}
