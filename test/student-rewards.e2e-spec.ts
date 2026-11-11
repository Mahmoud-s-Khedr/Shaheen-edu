import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { StudentCreditService } from '../src/modules/student-rewards/student-credit.service';
import { StudentRewardsService } from '../src/modules/student-rewards/student-rewards.service';
import { DEFAULT_REWARDS_SETTINGS } from '../src/modules/student-rewards/rewards-policy';
import { XPayService } from '../src/modules/commerce/xpay.service';
import { CommerceService } from '../src/modules/commerce/commerce.service';
import { CommerceExpiryService } from '../src/modules/commerce/commerce-expiry.service';
import { FulfilmentService } from '../src/modules/commerce/fulfilment.service';
import { RefundsService } from '../src/modules/commerce/refunds.service';
import { SalesOffersService } from '../src/modules/commerce/sales-offers.service';
import { TokenService } from '../src/modules/auth/services/token.service';

describe('Student credit and rewards (e2e)', () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let credit: StudentCreditService;
  let rewards: StudentRewardsService;
  let commerce: CommerceService;
  let fulfilment: FulfilmentService;
  let refunds: RefundsService;
  let offers: SalesOffersService;
  let admin: any;
  let students: string[];
  let courses: string[];
  let methodId: string;
  let gradeId: string;
  let governorateId: string;
  let policy: any;
  const approve = (orderId: string) =>
    db.$transaction(
      (tx) => fulfilment.fulfil(tx, { orderId, actorUserId: admin.id }),
      { isolationLevel: 'ReadCommitted' },
    );
  const grant = (student: string, amount: number, key = 'initial') =>
    credit.adjust(admin, student, {
      key,
      amountMinor: amount,
      reason: 'Test credit grant',
    });
  const buy = async (
    student: string,
    courseIndex: number,
    amount = 0,
    key = `order-${courseIndex}`,
  ) => {
    await commerce.addCartItem(student, {
      targetType: 'COURSE' as any,
      targetId: courses[courseIndex],
    });
    return commerce.checkout(
      student,
      { manualPaymentMethodId: methodId, creditAmountMinor: amount },
      key,
    );
  };
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    credit = app.get(StudentCreditService);
    rewards = app.get(StudentRewardsService);
    commerce = app.get(CommerceService);
    fulfilment = app.get(FulfilmentService);
    refunds = app.get(RefundsService);
    offers = app.get(SalesOffersService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    await cleanDatabase(app);
    await flushTestRedis(app);
    const owner = await seedSuperAdmin(
      app,
      'rewards-admin@example.com',
      'SuperAdminP@ss1!',
    );
    admin = { id: owner.id, role: 'SUPER_ADMIN' };
    gradeId = (await seedPublishedAcademicGrade(app, 'reward-grade')).id;
    governorateId = (await seedGovernorate(app, 'Rewards')).id;
    const subject = await db.subject.create({
      data: {
        title: 'Rewards subject',
        slug: 'rewards',
        sortOrder: 1,
        status: 'PUBLISHED',
        createdById: admin.id,
        updatedById: admin.id,
        gradeAssignments: {
          create: { academicGradeId: gradeId, sortOrder: 1 },
        },
      },
    });
    courses = [];
    for (let i = 0; i < 6; i++)
      courses.push(
        (
          await db.course.create({
            data: {
              title: `Course ${i}`,
              slug: `course-${i}`,
              subjectId: subject.id,
              sortOrder: i + 1,
              status: 'PUBLISHED',
              accessType: 'PAID',
              priceMinor: 1000,
              currency: 'EGP',
              isPurchasable: true,
              createdById: admin.id,
              updatedById: admin.id,
            },
          })
        ).id,
      );
    students = [];
    for (let i = 0; i < 4; i++)
      students.push(
        (
          await db.user.create({
            data: {
              role: 'STUDENT',
              loginIdentifier: `student-${i}`,
              passwordHash: 'unused',
              studentProfile: {
                create: {
                  fullName: `Student ${i}`,
                  nationalIdHash: `hash-${i}`,
                  nationalIdLast4: `000${i}`,
                  academicGradeId: gradeId,
                  governorate: 'Rewards',
                  governorateId,
                  parentPhoneNormalized: `0100000000${i}`,
                },
              },
            },
          })
        ).id,
      );
    methodId = (
      await db.manualPaymentMethod.create({
        data: {
          titleAr: 'Cash',
          instructionsAr: 'Pay',
          isActive: true,
          sortOrder: 1,
          createdById: admin.id,
        },
      })
    ).id;
    await refunds.updatePolicy(admin, {
      eligibilityWindowDays: 30,
      maximumConsumptionBps: 10000,
    });
    policy = JSON.parse(JSON.stringify(DEFAULT_REWARDS_SETTINGS));
    policy.credit.enabled = true;
    await rewards.saveSettings(admin, policy);
  });
  it('keeps an immutable history, expires unused lots and makes adjustments idempotent', async () => {
    await grant(students[0], 1000);
    await grant(students[0], 1000);
    expect((await credit.balance(students[0])).availableMinor).toBe(1000);
    await expect(
      credit.adjust(admin, students[0], {
        key: 'initial',
        amountMinor: 999,
        reason: 'Test credit grant',
      }),
    ).rejects.toThrow('different request');
    await db.studentCreditGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
    await credit.balance(students[0]);
    expect(
      await db.studentCreditEntry.count({ where: { type: 'EXPIRED' } }),
    ).toBe(1);
    await credit.adjust(admin, students[0], {
      key: 'negative',
      amountMinor: -200,
      reason: 'Correction creates debt',
    });
    await grant(students[0], 300, 'repayment');
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 100,
      debtMinor: 0,
    });
  });
  it('splits checkout payment, reserves credit, and releases it on cancellation', async () => {
    await grant(students[0], 500);
    const preview = await commerce.pricePreview(students[0], {
      targets: [{ targetType: 'COURSE' as any, targetId: courses[0] }],
      creditAmountMinor: 300,
    });
    expect(preview).toMatchObject({
      totalMinor: 1000,
      creditAppliedMinor: 300,
      paymentDueMinor: 700,
    });
    const order = await buy(students[0], 0, 300);
    expect(order).toMatchObject({
      total: { amountMinor: 700 },
      creditApplied: { amountMinor: 300 },
      priceAfterDiscount: { amountMinor: 1000 },
    });
    expect(order.items[0]).toMatchObject({
      externalPayment: { amountMinor: 700 },
      creditApplied: { amountMinor: 300 },
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 200,
      reservedMinor: 300,
    });
    await commerce.cancel(students[0], order.id);
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 500,
      reservedMinor: 0,
    });
  });
  it('rejects credit on excluded targets and enforces usage caps', async () => {
    await grant(students[0], 1000);
    policy.credit.maximumUsageBps = 5000;
    await rewards.saveSettings(admin, policy);
    await expect(buy(students[0], 0, 501)).rejects.toThrow('usage limit');
    policy.credit.excludedTargets = [`COURSE:${courses[0]}`];
    await rewards.saveSettings(admin, policy);
    await expect(
      commerce.checkout(
        students[0],
        { manualPaymentMethodId: methodId, creditAmountMinor: 1 },
        'excluded',
      ),
    ).rejects.toThrow('usage limit');
  });
  it('previews and checks out excluded content without spending credit', async () => {
    policy.credit.excludedTargets = [`COURSE:${courses[0]}`];
    await rewards.saveSettings(admin, policy);
    const preview = await commerce.pricePreview(students[0], {
      targets: [{ targetType: 'COURSE' as any, targetId: courses[0] }],
    });
    expect(preview).toMatchObject({
      maximumCreditMinor: 0,
      creditAppliedMinor: 0,
      paymentDueMinor: 1000,
    });
    const order = await buy(students[0], 0);
    expect(order).toMatchObject({
      status: 'AWAITING_PAYMENT',
      creditApplied: { amountMinor: 0 },
      total: { amountMinor: 1000 },
    });
  });
  it('previews and approves free content while credit spending is enabled', async () => {
    await db.course.update({
      where: { id: courses[0] },
      data: { priceMinor: 0 },
    });
    expect(
      await commerce.pricePreview(students[0], {
        targets: [{ targetType: 'COURSE' as any, targetId: courses[0] }],
      }),
    ).toMatchObject({ maximumCreditMinor: 0, paymentDueMinor: 0 });
    expect(await buy(students[0], 0)).toMatchObject({
      status: 'APPROVED',
      paymentChannel: 'ZERO_TOTAL',
      total: { amountMinor: 0 },
    });
  });
  it('preserves the original lot expiry when a student cancels a credit reservation', async () => {
    const expiresAt = new Date(Date.now() + 86400000);
    await credit.adjust(admin, students[0], {
      key: 'dated-credit',
      amountMinor: 500,
      reason: 'Dated credit grant',
      expiresAt,
    });
    for (const key of ['first-cancellation', 'second-cancellation']) {
      const order = await buy(students[0], 0, 1, key);
      await commerce.cancel(students[0], order.id);
      expect(await credit.balance(students[0])).toMatchObject({
        availableMinor: 500,
        reservedMinor: 0,
      });
      const lot = await db.studentCreditGrant.findFirstOrThrow();
      expect(lot.expiresAt).toEqual(expiresAt);
    }
  });
  it('fully funds orders with credit and never awards paid-purchase rewards for zero cash', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 1,
    };
    await rewards.saveSettings(admin, policy);
    await grant(students[0], 1000);
    const order = await buy(students[0], 0, 1000);
    expect(order).toMatchObject({
      status: 'APPROVED',
      paymentChannel: 'ZERO_TOTAL',
      total: { amountMinor: 0 },
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      reservedMinor: 0,
    });
    expect(await db.studentRewardAward.count()).toBe(0);
    expect(
      await db.studentEntitlement.count({
        where: { studentUserId: students[0], orderItemId: order.items[0].id },
      }),
    ).toBe(1);
  });
  it('prevents concurrent checkouts from spending the same balance', async () => {
    await grant(students[0], 700);
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    const results = await Promise.allSettled(
      ['a', 'b'].map((key) =>
        commerce.checkout(
          students[0],
          { manualPaymentMethodId: methodId, creditAmountMinor: 700 },
          key,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      reservedMinor: 700,
    });
  });
  it('releases reservations without extending expired credit when unpaid orders expire', async () => {
    await grant(students[0], 600);
    const order = await buy(students[0], 0, 500);
    await db.studentCreditGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await db.order.update({
      where: { id: order.id },
      data: { paymentExpiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(CommerceExpiryService).expireUnpaidOrders();
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      reservedMinor: 0,
    });
    await expect(approve(order.id)).rejects.toThrow('Reserved credit');
    await app.get(CommerceExpiryService).expireUnpaidOrders();
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
    const expired = await db.studentCreditEntry.aggregate({
      where: { type: 'EXPIRED' },
      _sum: { amountMinor: true },
    });
    expect(expired._sum.amountMinor).toBe(600);
  });
  it('rewards the first qualifying purchase after credit and retains checkout-time settings', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      minimumPaymentMinor: 900,
      rewardMinor: 250,
    };
    await rewards.saveSettings(admin, policy);
    await grant(students[0], 200);
    const first = await buy(students[0], 0, 200);
    await approve(first.id);
    expect(await db.studentRewardAward.count()).toBe(0);
    const second = await buy(students[0], 1);
    policy.firstPurchase.rewardMinor = 999;
    await rewards.saveSettings(admin, policy);
    await approve(second.id);
    await approve(second.id);
    expect((await credit.balance(students[0])).availableMinor).toBe(250);
    const third = await buy(students[0], 2);
    await approve(third.id);
    expect(
      await db.studentRewardAward.count({ where: { kind: 'FIRST_PURCHASE' } }),
    ).toBe(1);
  });
  it('recognizes historical qualifying purchases when launching the first-purchase program', async () => {
    const historical = await buy(students[0], 0);
    await approve(historical.id);
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 250,
      minimumPaymentMinor: 500,
    };
    await rewards.saveSettings(admin, policy);
    const next = await buy(students[0], 1);
    await approve(next.id);
    expect(await db.studentRewardAward.count()).toBe(0);
  });
  it('serializes simultaneous qualifying approvals so first-purchase credit is awarded once', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 250,
    };
    await rewards.saveSettings(admin, policy);
    const a = await buy(students[0], 0);
    const b = await buy(students[0], 1);
    await Promise.all([approve(a.id), approve(b.id)]);
    expect(await db.studentRewardAward.count()).toBe(1);
    expect((await credit.balance(students[0])).availableMinor).toBe(250);
  });
  it('awards student referrals and first purchase independently, once, without exposing private friend details', async () => {
    policy.referral = {
      ...policy.referral,
      enabled: true,
      rewardMinor: 300,
      invitedRewardMinor: 100,
      minimumPaymentMinor: 500,
    };
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
    };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    await db.$transaction((tx) =>
      rewards.attribute(tx, students[1], invite.code),
    );
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
    const order = await buy(students[1], 0);
    await approve(order.id);
    await approve(order.id);
    expect((await credit.balance(students[0])).availableMinor).toBe(300);
    expect((await credit.balance(students[1])).availableMinor).toBe(300);
    const second = await buy(students[1], 1);
    await approve(second.id);
    expect(await db.studentRewardAward.count()).toBe(3);
    const list = await rewards.ownReferrals(students[0], {
      page: 1,
      limit: 20,
    });
    expect(list.data[0]).not.toHaveProperty('invitedStudentId');
    expect(list.data[0]).not.toHaveProperty('parentPhoneNormalized');
  });
  it('rejects self-referrals, flags shared parent phones, and blocks student/partner referral combinations', async () => {
    policy.referral = { ...policy.referral, enabled: true, rewardMinor: 300 };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    await expect(
      db.$transaction((tx) => rewards.attribute(tx, students[0], invite.code)),
    ).rejects.toThrow('Self-referrals');
    await db.studentProfile.update({
      where: { userId: students[1] },
      data: { parentPhoneNormalized: '01000000000' },
    });
    await db.$transaction((tx) =>
      rewards.attribute(tx, students[1], invite.code),
    );
    const row = await db.studentReferral.findUniqueOrThrow({
      where: { invitedStudentId: students[1] },
    });
    expect(row).toMatchObject({
      status: 'SUSPENDED',
      reviewReason: 'SHARED_PARENT_PHONE',
    });
    await rewards.review(admin, row.id, {
      status: 'ACTIVE',
      note: 'Reviewed distinct students',
    });
    await expect(
      db.$transaction(async (tx) =>
        rewards.snapshot(tx, students[1], await rewards.settings(tx), true),
      ),
    ).rejects.toThrow('both student and partner');
    await rewards.setInviteStatus(
      admin,
      students[0],
      false,
      'Paused for review',
    );
    const order = await buy(students[1], 0);
    await approve(order.id);
    expect(await db.studentRewardAward.count()).toBe(0);
  });
  it('enforces a global referral reward limit under simultaneous approvals', async () => {
    policy.referral = {
      ...policy.referral,
      enabled: true,
      rewardMinor: 300,
      rewardLimit: 1,
    };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    for (const student of students.slice(1, 3))
      await db.$transaction((tx) =>
        rewards.attribute(tx, student, invite.code),
      );
    const a = await buy(students[1], 0);
    const b = await buy(students[2], 0);
    await Promise.all([approve(a.id), approve(b.id)]);
    expect(
      await db.studentRewardAward.count({ where: { kind: 'REFERRER' } }),
    ).toBe(1);
    expect((await credit.balance(students[0])).availableMinor).toBe(300);
  });
  it('returns credit separately from cash and reverses a spent reward into debt', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 500,
    };
    await rewards.saveSettings(admin, policy);
    const first = await buy(students[0], 0);
    await approve(first.id);
    await db.course.update({
      where: { id: courses[1] },
      data: { priceMinor: 200 },
    });
    const spent = await buy(students[0], 1, 200);
    expect(spent.status).toBe('APPROVED');
    const refund = await refunds.request(students[0], first.id, {
      reason: 'Refund first purchase',
    });
    expect(refund.items[0]).toMatchObject({
      amountMinor: 1000,
      creditReturnMinor: 0,
    });
    await refunds.approve(admin, refund.id, {
      manualRefundReference: 'cash-refund',
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      debtMinor: 200,
    });
    const creditRefund = await refunds.request(students[0], spent.id, {
      reason: 'Refund credit purchase',
    });
    expect(creditRefund.items[0]).toMatchObject({
      amountMinor: 0,
      creditReturnMinor: 200,
    });
    await refunds.approve(admin, creditRefund.id, {
      manualRefundReference: 'credit-only-refund',
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      debtMinor: 0,
    });
  });
  it('retains a reward after a partial refund while the remaining eligible cash still meets its minimum', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 1000,
    };
    await rewards.saveSettings(admin, policy);
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    const order = await buy(students[0], 1);
    await approve(order.id);
    const a = await refunds.request(students[0], order.id, {
      orderItemIds: [order.items[0].id],
      reason: 'First partial refund',
    });
    await refunds.approve(admin, a.id, {
      manualRefundReference: 'partial-one',
    });
    expect((await credit.balance(students[0])).availableMinor).toBe(200);
    const b = await refunds.request(students[0], order.id, {
      orderItemIds: [order.items[1].id],
      reason: 'Second partial refund',
    });
    await refunds.approve(admin, b.id, {
      manualRefundReference: 'partial-two',
    });
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
  });
  it('snapshots bundle credit rewards, first-purchase eligibility, and item credit allocations', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 500,
    };
    await rewards.saveSettings(admin, policy);
    const dto = {
      name: 'Reward offer',
      priceMinor: 1000,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      items: courses
        .slice(0, 2)
        .map((targetId) => ({ targetType: 'COURSE' as const, targetId })),
      creditRewardMinor: 100,
      firstPurchaseEligible: true,
    };
    const offer = await offers.save(admin, dto);
    await grant(students[0], 200);
    await commerce.addCartItem(students[0], {
      targetType: 'BUNDLE' as any,
      targetId: offer.id,
    });
    const order = await commerce.checkout(
      students[0],
      { manualPaymentMethodId: methodId, creditAmountMinor: 200 },
      'bundle',
    );
    expect(
      order.items.reduce(
        (sum: number, item: any) => sum + item.creditApplied.amountMinor,
        0,
      ),
    ).toBe(200);
    await offers.save(
      admin,
      { ...dto, creditRewardMinor: 999, firstPurchaseEligible: false },
      offer.id,
    );
    await approve(order.id);
    expect((await credit.balance(students[0])).availableMinor).toBe(300);
    const request = await refunds.request(students[0], order.id, {
      orderItemIds: [order.items[0].id],
      reason: 'Refund whole offer',
    });
    expect(request.items).toHaveLength(2);
    expect(
      request.items.reduce(
        (sum: number, item: any) => sum + item.amountMinor,
        0,
      ),
    ).toBe(800);
    await refunds.approve(admin, request.id, {
      manualRefundReference: 'bundle-refund',
    });
    expect((await credit.balance(students[0])).availableMinor).toBe(200);
  });
  it('keeps registration independent of referral codes', async () => {
    const dto = {
      fullName: 'New Student',
      nationalId: '29903030312345',
      phone: '01011112222',
      parentPhone: '01033334444',
      governorateId,
      academicGradeId: gradeId,
      password: 'StrongP@ssword123!',
    };
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: { ...dto, studentReferralCode: 'UNSUPPORTED' },
    });
    expect(rejected.statusCode).toBe(400);
    expect(
      await db.user.findUnique({ where: { loginIdentifier: dto.phone } }),
    ).toBeNull();
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: dto,
    });
    expect(accepted.statusCode).toBe(201);
    expect(await db.studentReferral.count()).toBe(0);
  });
  it('validates referral codes in preview and attributes them only during successful checkout', async () => {
    policy.referral = {
      ...policy.referral,
      enabled: true,
      rewardMinor: 300,
      invitedRewardMinor: 100,
    };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    const preview = await commerce.pricePreview(students[1], {
      targets: [{ targetType: 'COURSE' as any, targetId: courses[0] }],
      studentReferralCode: invite.code.toLowerCase(),
    });
    expect(preview.studentReferral).toMatchObject({
      code: invite.code,
      status: 'ACTIVE',
    });
    expect(await db.studentReferral.count()).toBe(0);
    await commerce.addCartItem(students[1], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    await expect(
      commerce.checkout(
        students[1],
        { manualPaymentMethodId: 'missing', studentReferralCode: invite.code },
        'failed-referral-checkout',
      ),
    ).rejects.toThrow('Active payment method');
    expect(await db.studentReferral.count()).toBe(0);
    const order = await commerce.checkout(
      students[1],
      { manualPaymentMethodId: methodId, studentReferralCode: invite.code },
      'referral-checkout',
    );
    expect(await db.studentReferral.count()).toBe(1);
    expect(await db.studentRewardAward.count()).toBe(0);
    await approve(order.id);
    expect((await credit.balance(students[0])).availableMinor).toBe(300);
    expect((await credit.balance(students[1])).availableMinor).toBe(100);
    await commerce.addCartItem(students[1], {
      targetType: 'COURSE' as any,
      targetId: courses[1],
    });
    const same = await commerce.checkout(
      students[1],
      { manualPaymentMethodId: methodId, studentReferralCode: invite.code },
      'same-referrer',
    );
    await approve(same.id);
    expect(await db.studentReferral.count()).toBe(1);
    expect((await credit.balance(students[0])).availableMinor).toBe(300);
    const other = await rewards.invite(students[2]);
    await expect(
      commerce.pricePreview(students[1], {
        targets: [{ targetType: 'COURSE' as any, targetId: courses[2] }],
        studentReferralCode: other.code,
      }),
    ).rejects.toThrow('different student referrer');
  });
  it('rejects invalid, self and mixed referral codes at checkout without saving an attribution', async () => {
    policy.referral = { ...policy.referral, enabled: true, rewardMinor: 300 };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    await expect(
      commerce.checkout(
        students[0],
        { manualPaymentMethodId: methodId, studentReferralCode: invite.code },
        'self-checkout',
      ),
    ).rejects.toThrow('Self-referrals');
    await expect(
      commerce.checkout(
        students[0],
        { manualPaymentMethodId: methodId, studentReferralCode: 'INVALID' },
        'invalid-checkout',
      ),
    ).rejects.toThrow('Invalid student referral');
    await expect(
      commerce.checkout(
        students[0],
        {
          manualPaymentMethodId: methodId,
          studentReferralCode: invite.code,
          referralCode: 'PARTNER',
        },
        'both-codes',
      ),
    ).rejects.toThrow('both student and partner');
    expect(await db.studentReferral.count()).toBe(0);
  });
  it('counts qualifying purchases before referral-code entry when deciding whether a referral reward is due', async () => {
    policy.referral = {
      ...policy.referral,
      enabled: true,
      rewardMinor: 300,
      minimumPaymentMinor: 500,
    };
    await rewards.saveSettings(admin, policy);
    const earlier = await buy(students[1], 0);
    await approve(earlier.id);
    const invite = await rewards.invite(students[0]);
    await commerce.addCartItem(students[1], {
      targetType: 'COURSE' as any,
      targetId: courses[1],
    });
    const order = await commerce.checkout(
      students[1],
      { manualPaymentMethodId: methodId, studentReferralCode: invite.code },
      'existing-paid-student',
    );
    await approve(order.id);
    expect(
      await db.studentRewardAward.count({ where: { kind: 'REFERRER' } }),
    ).toBe(0);
  });
  it('applies discounts before credit and uses only eligible external payment for rewards', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 750,
    };
    await rewards.saveSettings(admin, policy);
    await db.coupon.create({
      data: {
        code: 'SAVE200',
        name: 'Test coupon',
        updatedById: admin.id,
        kind: 'FIXED',
        amount: 200,
        appliesToAll: true,
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 86400000),
        createdById: admin.id,
      },
    });
    await grant(students[0], 100);
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    const order = await commerce.checkout(
      students[0],
      {
        manualPaymentMethodId: methodId,
        couponCode: 'SAVE200',
        creditAmountMinor: 100,
      },
      'coupon-and-credit',
    );
    expect(order).toMatchObject({
      discount: { amountMinor: 200 },
      priceAfterDiscount: { amountMinor: 800 },
      creditApplied: { amountMinor: 100 },
      total: { amountMinor: 700 },
    });
    await approve(order.id);
    expect(await db.studentRewardAward.count()).toBe(0);
  });
  it('does not use excluded content cash to meet a first-purchase threshold', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 1500,
      excludedTargets: [`COURSE:${courses[0]}`],
    };
    await rewards.saveSettings(admin, policy);
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    const order = await buy(students[0], 1);
    await approve(order.id);
    expect(await db.studentRewardAward.count()).toBe(0);
  });
  it('supports chapter purchases and excludes bundles from first-purchase rewards by default', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
    };
    await rewards.saveSettings(admin, policy);
    const offer = await offers.save(admin, {
      name: 'No first reward',
      priceMinor: 1000,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      items: [{ targetType: 'COURSE', targetId: courses[0] }],
    });
    await commerce.addCartItem(students[0], {
      targetType: 'BUNDLE' as any,
      targetId: offer.id,
    });
    const order = await commerce.checkout(
      students[0],
      { manualPaymentMethodId: methodId },
      'default-bundle',
    );
    await approve(order.id);
    expect(await db.studentRewardAward.count()).toBe(0);
    const chapter = await db.chapter.create({
      data: {
        courseId: courses[1],
        title: 'Reward chapter',
        slug: 'reward-chapter',
        sortOrder: 1,
        status: 'PUBLISHED',
        accessType: 'PAID',
        isPurchasable: true,
        priceMinor: 500,
        currency: 'EGP',
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    await commerce.addCartItem(students[0], {
      targetType: 'CHAPTER' as any,
      targetId: chapter.id,
    });
    const next = await commerce.checkout(
      students[0],
      { manualPaymentMethodId: methodId },
      'chapter',
    );
    await approve(next.id);
    expect((await credit.balance(students[0])).availableMinor).toBe(200);
  });
  it('sends XPay only the external portion and issues rewards after its confirmed payment', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
      minimumPaymentMinor: 500,
    };
    await rewards.saveSettings(admin, policy);
    await grant(students[0], 300);
    const provider = app.get(XPayService);
    const session = jest
      .spyOn(provider, 'createCheckoutSession')
      .mockResolvedValue({
        checkoutSessionId: 'credit-checkout-session',
        checkoutUrl: 'https://payments.example.test/session',
        paymentIntentId: 'credit-checkout-payment',
      });
    await commerce.addCartItem(students[0], {
      targetType: 'COURSE' as any,
      targetId: courses[0],
    });
    const order = await commerce.checkout(
      students[0],
      { paymentChannel: 'XPAY' as any, creditAmountMinor: 300 },
      'credit-xpay',
    );
    expect(session).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 700,
        items: [{ title: 'Course 0', amountMinor: 700 }],
      }),
    );
    expect(await db.studentRewardAward.count()).toBe(0);
    jest.spyOn(provider, 'verifyWebhookSignature').mockReturnValue(true);
    await commerce.xpayWebhook(
      Buffer.from(
        JSON.stringify({
          id: 'credit-confirmed-event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'credit-checkout-session',
              paymentStatus: 'paid',
              amountTotal: 700,
              currency: 'EGP',
              paymentIntentId: 'credit-checkout-payment',
            },
          },
        }),
      ),
      'test',
    );
    expect((await commerce.order(students[0], order.id)).status).toBe(
      'APPROVED',
    );
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 200,
      reservedMinor: 0,
    });
    session.mockRestore();
  });
  it('keeps a paid late XPay callback for review when its credit was released', async () => {
    await grant(students[0], 400);
    const order = await buy(students[0], 0, 400);
    await db.order.update({
      where: { id: order.id },
      data: { paymentChannel: 'XPAY' },
    });
    await db.paymentAttempt.create({
      data: {
        orderId: order.id,
        channel: 'XPAY',
        attemptNumber: 1,
        merchantReference: 'credit-late',
        providerOrderId: 'credit-late-session',
      },
    });
    await commerce.cancel(students[0], order.id);
    jest
      .spyOn(app.get(XPayService), 'verifyWebhookSignature')
      .mockReturnValue(true);
    const body = Buffer.from(
      JSON.stringify({
        id: 'credit-late-event',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'credit-late-session',
            paymentStatus: 'paid',
            amountTotal: 600,
            currency: 'EGP',
            paymentIntentId: 'credit-late-payment',
          },
        },
      }),
    );
    await commerce.xpayWebhook(body, 'test');
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({
      status: 'PAYMENT_REVIEW',
      paymentAttentionReason: 'CREDIT_UNAVAILABLE_AFTER_PAYMENT',
    });
    expect(
      await db.paymentAttempt.findFirstOrThrow({
        where: { orderId: order.id },
      }),
    ).toMatchObject({ status: 'PAID' });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 400,
      reservedMinor: 0,
    });
    await commerce.recordOfferPaymentRefund(
      admin,
      order.id,
      'late-cash-refunded',
    );
    expect((await commerce.order(students[0], order.id)).status).toBe(
      'CANCELLED',
    );
    await commerce.xpayWebhook(body, 'test');
    expect((await credit.balance(students[0])).availableMinor).toBe(400);
  });
  it('releases reserved credit when an XPay bundle loses its final spot', async () => {
    const offer = await offers.save(admin, {
      name: 'Final credit spot',
      priceMinor: 1000,
      purchaseLimit: 1,
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      items: [{ targetType: 'COURSE', targetId: courses[0] }],
    });
    await grant(students[1], 300);
    const orders = [] as any[];
    for (const student of students.slice(0, 2)) {
      await commerce.addCartItem(student, {
        targetType: 'BUNDLE' as any,
        targetId: offer.id,
      });
      orders.push(
        await commerce.checkout(
          student,
          {
            manualPaymentMethodId: methodId,
            creditAmountMinor: student === students[1] ? 300 : 0,
          },
          'last-spot',
        ),
      );
    }
    await approve(orders[0].id);
    await db.order.update({
      where: { id: orders[1].id },
      data: { paymentChannel: 'XPAY' },
    });
    await db.paymentAttempt.create({
      data: {
        orderId: orders[1].id,
        channel: 'XPAY',
        attemptNumber: 1,
        merchantReference: 'soldout-credit',
        providerOrderId: 'soldout-credit-session',
      },
    });
    jest
      .spyOn(app.get(XPayService), 'verifyWebhookSignature')
      .mockReturnValue(true);
    await commerce.xpayWebhook(
      Buffer.from(
        JSON.stringify({
          id: 'soldout-credit-event',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'soldout-credit-session',
              paymentStatus: 'paid',
              amountTotal: 700,
              currency: 'EGP',
            },
          },
        }),
      ),
      'test',
    );
    expect((await commerce.order(students[1], orders[1].id)).status).toBe(
      'PAYMENT_REVIEW',
    );
    expect(await credit.balance(students[1])).toMatchObject({
      availableMinor: 300,
      reservedMinor: 0,
    });
    expect(await db.studentRewardAward.count()).toBe(0);
  });
  it('reverses both referral rewards when refunded cash falls below the referral minimum', async () => {
    policy.referral = {
      ...policy.referral,
      enabled: true,
      rewardMinor: 300,
      invitedRewardMinor: 100,
      minimumPaymentMinor: 1000,
    };
    await rewards.saveSettings(admin, policy);
    const invite = await rewards.invite(students[0]);
    await db.$transaction((tx) =>
      rewards.attribute(tx, students[1], invite.code),
    );
    const order = await buy(students[1], 0);
    await approve(order.id);
    const refund = await refunds.request(students[1], order.id, {
      reason: 'Reverse referral rewards',
    });
    await refunds.approve(admin, refund.id, {
      manualRefundReference: 'referral-refund',
    });
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
    expect((await credit.balance(students[1])).availableMinor).toBe(0);
    expect(
      await db.studentRewardAward.count({
        where: { reversedAt: { not: null } },
      }),
    ).toBe(2);
  });
  it('does not create debt when returned reward credit later expires before its source purchase is refunded', async () => {
    policy.firstPurchase = {
      ...policy.firstPurchase,
      enabled: true,
      rewardMinor: 200,
    };
    policy.credit.expiryDays = 1;
    await rewards.saveSettings(admin, policy);
    const source = await buy(students[0], 0);
    await approve(source.id);
    const pending = await buy(students[0], 1, 200);
    await commerce.cancel(students[0], pending.id);
    await db.studentCreditGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await credit.expireCredits();
    const refund = await refunds.request(students[0], source.id, {
      reason: 'Refund expired reward source',
    });
    await refunds.approve(admin, refund.id, {
      manualRefundReference: 'expired-source',
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 0,
      debtMinor: 0,
    });
  });
  it.each([
    ['cancel', false],
    ['expire', false],
    ['cancel', true],
    ['expire', true],
  ] as const)(
    'reconciles reversed expired reservations on %s (recovered from other credit: %s)',
    async (action, recoverFromOtherCredit) => {
      policy.firstPurchase = {
        ...policy.firstPurchase,
        enabled: true,
        rewardMinor: 200,
      };
      policy.credit.expiryDays = 1;
      await rewards.saveSettings(admin, policy);
      const source = await buy(students[0], 0);
      await approve(source.id);
      const pending = await buy(students[0], 1, 200);
      if (recoverFromOtherCredit) await grant(students[0], 300, 'other-credit');
      const refund = await refunds.request(students[0], source.id, {
        reason: 'Refund reserved reward source',
      });
      await refunds.approve(admin, refund.id, {
        manualRefundReference: 'reserved-source-refund',
      });
      expect(await credit.balance(students[0])).toMatchObject({
        availableMinor: recoverFromOtherCredit ? 100 : 0,
        debtMinor: recoverFromOtherCredit ? 0 : 200,
        reservedMinor: 200,
      });
      await db.studentCreditGrant.updateMany({
        where: { sourceKey: `reward:first:${students[0]}` },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      if (action === 'cancel') {
        await commerce.cancel(students[0], pending.id);
      } else {
        await db.order.update({
          where: { id: pending.id },
          data: { paymentExpiresAt: new Date(Date.now() - 1000) },
        });
        await app.get(CommerceExpiryService).expireUnpaidOrders();
      }
      const expected = {
        availableMinor: recoverFromOtherCredit ? 300 : 0,
        reservedMinor: 0,
        debtMinor: 0,
      };
      expect(await credit.balance(students[0])).toMatchObject(expected);
      await db.$transaction((tx) => credit.release(tx, pending.id));
      expect(await credit.balance(students[0])).toMatchObject(expected);
    },
  );
  it('extends only refunded credit and keeps adjustment retries idempotent', async () => {
    const dto = {
      key: 'retry-expiry',
      amountMinor: 1000,
      reason: 'Original adjustment',
      expiresAt: new Date(Date.now() + 86400000),
    };
    await credit.adjust(admin, students[0], dto);
    const order = await buy(students[0], 0, 200);
    await approve(order.id);
    const refund = await refunds.request(students[0], order.id, {
      reason: 'Return spent credit',
    });
    await refunds.approve(admin, refund.id, {
      manualRefundReference: 'retry-credit-refund',
    });
    const lot = await db.studentCreditGrant.findUniqueOrThrow({
      where: { sourceKey: `admin:${students[0]}:${dto.key}` },
    });
    expect(lot.expiresAt).toEqual(dto.expiresAt);
    expect(lot.remainingMinor).toBe(800);
    expect(lot.originalExpiresAt).toEqual(dto.expiresAt);
    const returned = await db.studentCreditGrant.findFirstOrThrow({
      where: { rootGrantId: lot.id },
    });
    expect(returned.remainingMinor).toBe(200);
    expect(returned.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 29 * 86400000,
    );
    await expect(credit.adjust(admin, students[0], dto)).resolves.toMatchObject(
      {
        availableMinor: 1000,
      },
    );
    await expect(
      credit.adjust(admin, students[0], {
        ...dto,
        expiresAt: returned.expiresAt,
      }),
    ).rejects.toThrow('different expiry');
    expect(
      await db.studentCreditEntry.count({
        where: { key: `admin:${students[0]}:${dto.key}` },
      }),
    ).toBe(1);
    await db.studentCreditGrant.update({
      where: { id: lot.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await credit.expireCredits();
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 200,
      debtMinor: 0,
    });
  });
  it('expires unused credit before restoring a refund and never resurrects the expired remainder', async () => {
    await credit.adjust(admin, students[0], {
      key: 'expiring',
      amountMinor: 1000,
      reason: 'Expiring grant',
      expiresAt: new Date(Date.now() + 86400000),
    });
    const order = await buy(students[0], 0, 200);
    await approve(order.id);
    await db.studentCreditGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const refund = await refunds.request(students[0], order.id, {
      reason: 'Return only spent credit',
    });
    await refunds.approve(admin, refund.id, {
      manualRefundReference: 'expired-remainder',
    });
    expect(await credit.balance(students[0])).toMatchObject({
      availableMinor: 200,
      debtMinor: 0,
    });
    const lot = await db.studentCreditGrant.findFirstOrThrow({
      where: { rootGrantId: { not: null } },
    });
    await db.studentCreditGrant.update({
      where: { id: lot.id },
      data: { expiresAt: new Date(Date.now() - 500) },
    });
    await credit.expireCredits();
    expect((await credit.balance(students[0])).availableMinor).toBe(0);
    expect(
      await db.studentCreditEntry.count({ where: { type: 'EXPIRED' } }),
    ).toBe(2);
  });
  it.each(['available', 'spent', 'expired', 'returned twice'])(
    'preserves reward reversal provenance when refunded credit is %s',
    async (state) => {
      policy.firstPurchase = {
        ...policy.firstPurchase,
        enabled: true,
        rewardMinor: 1000,
      };
      policy.credit.expiryDays = 1;
      await rewards.saveSettings(admin, policy);
      const source = await buy(students[0], 0);
      await approve(source.id);
      const spent = await buy(students[0], 1, 200);
      await approve(spent.id);
      const refund = await refunds.request(students[0], spent.id, {
        reason: 'Return reward credit',
      });
      await refunds.approve(admin, refund.id, {
        manualRefundReference: 'return-reward',
      });
      const root = await db.studentCreditGrant.findUniqueOrThrow({
        where: { sourceKey: `reward:first:${students[0]}` },
      });
      await db.studentCreditGrant.update({
        where: { id: root.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await credit.expireCredits();
      expect((await credit.balance(students[0])).availableMinor).toBe(200);
      if (state === 'spent' || state === 'returned twice') {
        const second = await buy(students[0], 2, 200);
        await approve(second.id);
        if (state === 'returned twice') {
          const secondRefund = await refunds.request(students[0], second.id, {
            reason: 'Return reward credit again',
          });
          await refunds.approve(admin, secondRefund.id, {
            manualRefundReference: 'second-return',
          });
          expect(
            await db.studentCreditGrant.count({
              where: { rootGrantId: root.id },
            }),
          ).toBe(2);
        }
      } else if (state === 'expired') {
        await db.studentCreditGrant.updateMany({
          where: { rootGrantId: root.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await credit.expireCredits();
      }
      const sourceRefund = await refunds.request(students[0], source.id, {
        reason: 'Reverse original reward',
      });
      await refunds.approve(admin, sourceRefund.id, {
        manualRefundReference: 'reverse-source',
      });
      expect(await credit.balance(students[0])).toMatchObject({
        availableMinor: 0,
        debtMinor: state === 'spent' ? 200 : 0,
      });
      expect(
        await db.studentCreditGrant.count({
          where: { rootGrantId: root.id, revokedAt: null },
        }),
      ).toBe(0);
    },
  );
  it('validates the HTTP settings contract and protects administrator adjustments', async () => {
    const tokens = app.get(TokenService);
    const makeToken = async (userId: string, role: any) => {
      const session = await db.authSession.create({
        data: {
          userId,
          refreshTokenHash: `rewards-${userId}`,
          familyId: `rewards-${userId}`,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return tokens.signUserAccessToken({
        userId,
        role,
        sessionId: session.id,
      });
    };
    const studentToken = await makeToken(students[0], 'STUDENT');
    const adminToken = await makeToken(admin.id, 'SUPER_ADMIN');
    const studentHeaders = { authorization: `Bearer ${studentToken}` };
    const adminHeaders = { authorization: `Bearer ${adminToken}` };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/admin/student-rewards/settings',
          headers: adminHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/students/${students[0]}/credit/adjustments`,
          headers: studentHeaders,
          payload: {
            key: 'forbidden',
            amountMinor: 100,
            reason: 'Not allowed',
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/student/price-preview',
          headers: studentHeaders,
          payload: {
            targets: [{ targetType: 'COURSE', targetId: courses[0] }],
            creditAmountMinor: -1,
          },
        })
      ).statusCode,
    ).toBe(400);
    const result = await app.inject({
      method: 'GET',
      url: '/api/v1/student/credit',
      headers: studentHeaders,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      availableMinor: 0,
      reservedMinor: 0,
      currency: 'EGP',
    });
  });
});
