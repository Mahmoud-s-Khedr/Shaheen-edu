import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Prisma } from '@prisma/client';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { SalesOffersService } from '../src/modules/commerce/sales-offers.service';
import { CommerceService } from '../src/modules/commerce/commerce.service';
import { FulfilmentService } from '../src/modules/commerce/fulfilment.service';
import { RefundsService } from '../src/modules/commerce/refunds.service';
import { XPayService } from '../src/modules/commerce/xpay.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AssetsService } from '../src/modules/assets/assets.service';

describe('Sales offers commerce (e2e)', () => {
  let app: NestFastifyApplication;
  let db: PrismaService;
  let offers: SalesOffersService;
  let commerce: CommerceService;
  let fulfilment: FulfilmentService;
  let refunds: RefundsService;
  let admin: any;
  let students: string[];
  let courses: string[];
  let chapterId: string;
  let methodId: string;
  let partnerId: string;
  let referral: { programId: string; codeId: string; ruleId: string };
  const day = 86_400_000;
  const saveOffer = (
    items: any[],
    priceMinor = 701,
    purchaseLimit: number | null = 1,
  ) => ({
    name: 'Offer',
    priceMinor,
    startsAt: new Date(Date.now() - day),
    endsAt: new Date(Date.now() + day),
    purchaseLimit,
    items,
  });
  const targets = () =>
    courses.map((targetId) => ({ targetType: 'COURSE' as const, targetId }));
  const checkout = async (
    student: string,
    offerId: string,
    key: string,
    extra = false,
  ) => {
    await commerce.addCartItem(student, {
      targetType: 'BUNDLE',
      targetId: offerId,
    });
    if (extra)
      await commerce.addCartItem(student, {
        targetType: 'COURSE',
        targetId: courses[1],
      });
    return commerce.checkout(student, { manualPaymentMethodId: methodId }, key);
  };
  const approve = (orderId: string) =>
    db.$transaction(
      (tx) => fulfilment.fulfil(tx, { orderId, actorUserId: admin.id }),
      { isolationLevel: 'ReadCommitted' },
    );

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    offers = app.get(SalesOffersService);
    commerce = app.get(CommerceService);
    fulfilment = app.get(FulfilmentService);
    refunds = app.get(RefundsService);
    await cleanDatabase(app);
    await flushTestRedis(app);
    const owner = await seedSuperAdmin(
      app,
      'offer-admin@example.com',
      'SuperAdminP@ss1!',
    );
    admin = { id: owner.id, role: 'SUPER_ADMIN' };
    const grade = await seedPublishedAcademicGrade(app, 'offers-grade');
    const governorate = await seedGovernorate(app, 'Offers');
    const subject = await db.subject.create({
      data: {
        title: 'Offers subject',
        slug: 'offers-subject',
        sortOrder: 1,
        status: 'PUBLISHED',
        createdById: admin.id,
        updatedById: admin.id,
        gradeAssignments: {
          create: { academicGradeId: grade.id, sortOrder: 1 },
        },
      },
    });
    courses = [];
    for (let i = 1; i <= 2; i++)
      courses.push(
        (
          await db.course.create({
            data: {
              title: `Course ${i}`,
              slug: `course-${i}`,
              subjectId: subject.id,
              sortOrder: i,
              status: 'PUBLISHED',
              accessType: 'PAID',
              priceMinor: i * 1000,
              currency: 'EGP',
              isPurchasable: true,
              createdById: admin.id,
              updatedById: admin.id,
            },
          })
        ).id,
      );
    chapterId = (
      await db.chapter.create({
        data: {
          courseId: courses[0],
          title: 'Chapter',
          slug: 'chapter',
          sortOrder: 1,
          status: 'PUBLISHED',
          accessType: 'PAID',
          isPurchasable: true,
          priceMinor: 500,
          currency: 'EGP',
          createdById: admin.id,
          updatedById: admin.id,
        },
      })
    ).id;
    students = [];
    for (let i = 1; i <= 4; i++) {
      const user = await db.user.create({
        data: {
          role: 'STUDENT',
          loginIdentifier: `student-${i}`,
          passwordHash: 'unused',
          studentProfile: {
            create: {
              fullName: `Student ${i}`,
              nationalIdHash: `hash-${i}`,
              nationalIdLast4: `000${i}`,
              academicGradeId: grade.id,
              governorate: 'Offers',
              governorateId: governorate.id,
              parentPhoneNormalized: `0100000000${i}`,
            },
          },
        },
      });
      students.push(user.id);
    }
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
    const partner = await db.user.create({
      data: {
        role: 'PARTNER',
        loginIdentifier: 'offer-partner',
        passwordHash: 'unused',
        partnerProfile: {
          create: {
            partnerType: 'CONTENT_PUBLISHER',
            displayName: 'Publisher',
            createdByAdminId: admin.id,
          },
        },
      },
    });
    partnerId = partner.id;
    for (const courseId of courses)
      await db.publisherAgreement.create({
        data: {
          publisherUserId: partnerId,
          courseId,
          revenueShareBps: 1000,
          startsAt: new Date(Date.now() - day),
          status: 'ACTIVE',
          createdById: admin.id,
        },
      });
    const program = await db.referralProgram.create({
      data: {
        partnerUserId: partnerId,
        name: 'Referral',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - day),
        createdById: admin.id,
        codes: { create: { code: 'OFFERREF' } },
        rules: {
          create: {
            version: 1,
            kind: 'FIXED_PER_SALE',
            fixedCommissionMinor: 101,
            startsAt: new Date(Date.now() - day),
            isActive: true,
          },
        },
      },
      include: { codes: true, rules: true },
    });
    referral = {
      programId: program.id,
      codeId: program.codes[0].id,
      ruleId: program.rules[0].id,
    };
  });
  afterAll(async () => {
    await app.close();
  });

  it('snapshots mixed carts, retains paid XPay after sellout, and refunds a complete bundle while preserving other access', async () => {
    const offer = await offers.save(admin, saveOffer(targets()));
    await db.studentEntitlement.create({
      data: {
        studentUserId: students[0],
        courseId: courses[0],
        grantedById: admin.id,
      },
    });
    expect(
      (await offers.studentOffer(students[0], offer.id)).items.map(
        (x: any) => x.owned,
      ),
    ).toEqual([true, false]);
    const first = await checkout(students[0], offer.id, 'one', true);
    const second = await checkout(students[1], offer.id, 'two');
    await db.orderReferralAttribution.create({
      data: {
        orderId: first.id,
        studentUserId: students[0],
        referralProgramId: referral.programId,
        referralCodeId: referral.codeId,
        ruleId: referral.ruleId,
        snapshot: {
          partnerUserId: partnerId,
          kind: 'FIXED_PER_SALE',
          fixedCommissionMinor: 101,
        },
      },
    });
    expect(first.total.amountMinor).toBe(2701);
    expect(
      first.bundles[0].snapshot.items.map((i: any) => i.weightMinor),
    ).toEqual([1000, 2000]);
    expect(
      first.items
        .filter((x: any) => x.salesOfferPurchaseId)
        .reduce((sum: number, x: any) => sum + x.price.amountMinor, 0),
    ).toBe(701);
    await offers.save(
      admin,
      { ...saveOffer([targets()[0]], 999), name: 'Edited' },
      offer.id,
    );
    await offers.status(admin, offer.id, 'PAUSED');
    await approve(first.id);
    const allocationRows = await db.partnerAllocation.findMany({
      where: {
        orderItem: {
          orderId: first.id,
          salesOfferPurchaseId: first.bundles[0].id,
        },
      },
    });
    expect(
      allocationRows
        .filter((x) => x.kind === 'PUBLISHER_SALE')
        .reduce((sum, x) => sum + x.amountMinor, 0),
    ).toBe(69);
    expect(
      allocationRows
        .filter((x) => x.kind === 'REFERRAL_COMMISSION')
        .reduce((sum, x) => sum + x.amountMinor, 0),
    ).toBe(101);
    expect(
      (await commerce.order(students[0], first.id)).bundles[0].snapshot.name,
    ).toBe('Offer');
    await db.order.update({
      where: { id: second.id },
      data: { paymentChannel: 'XPAY' },
    });
    await db.paymentAttempt.create({
      data: {
        orderId: second.id,
        channel: 'XPAY',
        attemptNumber: 1,
        merchantReference: 'merchant-1',
        providerOrderId: 'session-1',
      },
    });
    jest
      .spyOn(app.get(XPayService), 'verifyWebhookSignature')
      .mockReturnValue(true);
    const payload = Buffer.from(
      JSON.stringify({
        id: 'event-1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-1',
            paymentStatus: 'paid',
            amountTotal: 701,
            currency: 'EGP',
            paymentIntentId: 'payment-1',
          },
        },
      }),
    );
    await commerce.xpayWebhook(payload, 'test');
    expect(
      await db.order.findUniqueOrThrow({ where: { id: second.id } }),
    ).toMatchObject({
      status: 'PAYMENT_REVIEW',
      paymentAttentionReason: 'OFFER_UNAVAILABLE_AFTER_PAYMENT',
    });
    expect(
      await db.paymentAttempt.findFirstOrThrow({
        where: { orderId: second.id },
      }),
    ).toMatchObject({ status: 'PAID' });
    expect(
      await db.studentEntitlement.count({
        where: { studentUserId: students[1] },
      }),
    ).toBe(0);
    await commerce.recordOfferPaymentRefund(
      admin,
      second.id,
      'external-refund-1',
    );
    const repeated = JSON.parse(payload.toString());
    repeated.id = 'event-1-repeat';
    await commerce.xpayWebhook(Buffer.from(JSON.stringify(repeated)), 'test');
    expect(
      await db.order.findUniqueOrThrow({ where: { id: second.id } }),
    ).toMatchObject({
      status: 'CANCELLED',
      externalRefundReference: 'external-refund-1',
    });
    await offers.status(admin, offer.id, 'ACTIVE');
    const bundleLine = first.items.find(
      (item: any) => item.salesOfferPurchaseId,
    );
    const request = await refunds.request(students[0], first.id, {
      reason: 'Please refund',
      orderItemIds: [bundleLine.id],
    });
    expect(request.items).toHaveLength(2);
    await refunds.approve(admin, request.id, {
      manualRefundReference: 'refund-1',
    });
    const reversals = await db.partnerAllocation.findMany({
      where: { reversedAllocationId: { in: allocationRows.map((x) => x.id) } },
    });
    expect(reversals.reduce((sum, x) => sum + x.amountMinor, 0)).toBe(-170);
    const grants = await db.studentEntitlement.findMany({
      where: { studentUserId: students[0] },
    });
    expect(grants.filter((g) => g.status === 'ACTIVE')).toHaveLength(2);
    expect(
      (await offers.studentOffer(students[0], offer.id)).remainingSpots,
    ).toBe(1);
    await checkout(students[0], offer.id, 'repurchase');
  });

  it('serializes concurrent approvals for the final spot', async () => {
    const offer = await offers.save(admin, {
      ...saveOffer(targets(), 800),
      name: 'Last spot',
    });
    const first = await checkout(students[2], offer.id, 'race-1');
    const second = await checkout(students[3], offer.id, 'race-2');
    const outcomes = await Promise.allSettled([
      approve(first.id),
      approve(second.id),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      await db.salesOfferPurchase.count({
        where: {
          salesOfferId: offer.id,
          allocatedAt: { not: null },
          releasedAt: null,
        },
      }),
    ).toBe(1);
    expect(
      await db.studentEntitlement.count({
        where: {
          studentUserId: { in: [students[2], students[3]] },
          status: 'ACTIVE',
        },
      }),
    ).toBe(2);
  });

  it('prevents concurrent duplicate purchases by one student', async () => {
    const offer = await offers.save(admin, {
      ...saveOffer(targets(), 801, 5),
      name: 'One per student',
    });
    const first = await checkout(students[3], offer.id, 'duplicate-1');
    const second = await checkout(students[3], offer.id, 'duplicate-2');
    const outcomes = await Promise.allSettled([
      approve(first.id),
      approve(second.id),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db.salesOfferPurchase.count({
        where: {
          salesOfferId: offer.id,
          studentUserId: students[3],
          allocatedAt: { not: null },
          releasedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('retains both concurrent XPay payments while granting only the final spot', async () => {
    const offer = await offers.save(admin, {
      ...saveOffer(targets(), 850),
      name: 'XPay final spot',
    });
    const orders = [
      await checkout(students[2], offer.id, 'xpay-race-1'),
      await checkout(students[3], offer.id, 'xpay-race-2'),
    ];
    for (let i = 0; i < orders.length; i++) {
      await db.order.update({
        where: { id: orders[i].id },
        data: { paymentChannel: 'XPAY' },
      });
      await db.paymentAttempt.create({
        data: {
          orderId: orders[i].id,
          channel: 'XPAY',
          attemptNumber: 1,
          merchantReference: `race-merchant-${i}`,
          providerOrderId: `race-session-${i}`,
        },
      });
    }
    const payloads = orders.map((_, i) =>
      Buffer.from(
        JSON.stringify({
          id: `race-event-${i}`,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: `race-session-${i}`,
              paymentStatus: 'paid',
              amountTotal: 850,
              currency: 'EGP',
              paymentIntentId: `race-payment-${i}`,
            },
          },
        }),
      ),
    );
    await Promise.all(
      payloads.map((payload) => commerce.xpayWebhook(payload, 'test')),
    );
    const results = await db.order.findMany({
      where: { id: { in: orders.map((order) => order.id) } },
      include: { paymentAttempts: true },
    });
    expect(results.filter((order) => order.status === 'APPROVED')).toHaveLength(
      1,
    );
    expect(
      results.filter((order) => order.status === 'PAYMENT_REVIEW'),
    ).toHaveLength(1);
    expect(
      results
        .flatMap((order) => order.paymentAttempts)
        .filter((attempt) => attempt.status === 'PAID'),
    ).toHaveLength(2);
    expect(
      await db.salesOfferPurchase.count({
        where: {
          salesOfferId: offer.id,
          allocatedAt: { not: null },
          releasedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('preserves a paid attempt when a different unpaid event arrives concurrently', async () => {
    const offer = await offers.save(admin, saveOffer(targets(), 875));
    const order = await checkout(students[2], offer.id, 'xpay-status-race');
    await db.order.update({
      where: { id: order.id },
      data: { paymentChannel: 'XPAY' },
    });
    const attempt = await db.paymentAttempt.create({
      data: {
        orderId: order.id,
        channel: 'XPAY',
        attemptNumber: 1,
        merchantReference: 'status-race-merchant',
        providerOrderId: 'status-race-session',
      },
    });
    jest
      .spyOn(app.get(XPayService), 'verifyWebhookSignature')
      .mockReturnValue(true);
    const payload = (paid: boolean) =>
      Buffer.from(
        JSON.stringify({
          id: paid ? 'status-race-paid' : 'status-race-pending',
          type: paid
            ? 'checkout.session.async_payment_succeeded'
            : 'checkout.session.completed',
          data: {
            object: {
              id: 'status-race-session',
              paymentStatus: paid ? 'paid' : 'unpaid',
              amountTotal: 875,
              currency: 'EGP',
              ...(paid ? { paymentIntentId: 'status-race-payment' } : {}),
            },
          },
        }),
      );
    let paidWritten!: () => void;
    let pendingAtBoundary!: () => void;
    let releasePaid!: () => void;
    const paidWrite = new Promise<void>((resolve) => {
      paidWritten = resolve;
    });
    const pendingBoundary = new Promise<void>((resolve) => {
      pendingAtBoundary = resolve;
    });
    const paidRelease = new Promise<void>((resolve) => {
      releasePaid = resolve;
    });
    const transaction = db.$transaction.bind(db);
    let transactionIndex = 0;
    // Pause the paid transaction after its write. The other event must wait
    // before reading that attempt, rather than overwrite it from stale state.
    const transactionSpy = jest.spyOn(db, '$transaction').mockImplementation(((
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
      },
    ) => {
      const isPending = transactionIndex++ === 1;
      return transaction(
        async (tx) =>
          callback(
            new Proxy(tx, {
              get(target, property): unknown {
                if (property === '$executeRaw')
                  return async (
                    query: TemplateStringsArray | Prisma.Sql,
                    ...values: unknown[]
                  ) => {
                    if (
                      isPending &&
                      values[0] === 'xpay-session:status-race-session'
                    )
                      pendingAtBoundary();
                    return target.$executeRaw(query, ...values);
                  };
                if (property === 'paymentAttempt')
                  return {
                    ...target.paymentAttempt,
                    findFirst: async (
                      args: Prisma.PaymentAttemptFindFirstArgs,
                    ) => {
                      const result =
                        await target.paymentAttempt.findFirst(args);
                      if (isPending) pendingAtBoundary();
                      return result;
                    },
                    update: async (args: Prisma.PaymentAttemptUpdateArgs) => {
                      const result = await target.paymentAttempt.update(args);
                      if (!isPending) {
                        paidWritten();
                        await paidRelease;
                      }
                      return result;
                    },
                  };
                return Reflect.get(target, property);
              },
            }),
          ),
        options,
      );
    }) as typeof db.$transaction);
    const paid = commerce.xpayWebhook(payload(true), 'test');
    let pending: ReturnType<CommerceService['xpayWebhook']> | undefined;
    try {
      await paidWrite;
      pending = commerce.xpayWebhook(payload(false), 'test');
      await pendingBoundary;
      releasePaid();
      await Promise.all([paid, pending]);
    } finally {
      releasePaid();
      await Promise.allSettled([paid, pending]);
      transactionSpy.mockRestore();
    }
    expect(
      await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
    ).toMatchObject({
      status: 'PAID',
      providerTransactionId: 'status-race-payment',
      completedAt: expect.any(Date),
      providerPayload: expect.objectContaining({ paymentStatus: 'paid' }),
    });
    expect(
      await db.xPayWebhookEvent.count({
        where: {
          externalEventId: { in: ['status-race-paid', 'status-race-pending'] },
          processedAt: { not: null },
        },
      }),
    ).toBe(2);
  });

  it('protects offer covers from direct and replacement-driven archiving', async () => {
    const cover = await db.asset.create({
      data: {
        provider: 'BUNNY_STORAGE',
        kind: 'COVER_IMAGE',
        status: 'READY',
        originalFilename: 'offer.png',
        filename: 'offer.png',
        mimeType: 'image/png',
        uploadedById: admin.id,
      },
    });
    await offers.save(admin, {
      ...saveOffer(targets()),
      coverAssetId: cover.id,
    });
    const assets = app.get(AssetsService);
    await expect(assets.archive(admin, cover.id)).rejects.toThrow(
      'Referenced assets cannot be archived',
    );
    await assets.archiveIfUnreferenced(admin, cover.id);
    expect(
      await db.asset.findUniqueOrThrow({ where: { id: cover.id } }),
    ).toMatchObject({ status: 'READY', archivedAt: null });
  });

  it('does not release an offer spot when a bundle is refunded after the offer ends', async () => {
    const offer = await offers.save(admin, {
      ...saveOffer(targets(), 750),
      name: 'Ends before refund',
    });
    const order = await checkout(students[2], offer.id, 'end-before-refund');
    const proof = await db.asset.create({
      data: {
        provider: 'BUNNY_STORAGE',
        kind: 'PAYMENT_PROOF',
        status: 'READY',
        originalFilename: 'proof.png',
        filename: 'proof.png',
        mimeType: 'image/png',
        uploadedById: students[2],
      },
    });
    const submission = await db.manualPaymentSubmission.create({
      data: { orderId: order.id, proofAssetId: proof.id },
    });
    await db.order.update({
      where: { id: order.id },
      data: { status: 'SUBMITTED' },
    });
    await offers.status(admin, offer.id, 'ENDED');
    await commerce.approve(admin, submission.id);
    const request = await refunds.request(students[2], order.id, {
      reason: 'Please refund',
      orderItemIds: [order.items[0].id],
    });
    await refunds.approve(admin, request.id, {
      manualRefundReference: 'end-refund',
    });
    expect(
      await db.salesOfferPurchase.findUniqueOrThrow({
        where: { id: order.bundles[0].id },
      }),
    ).toMatchObject({ releasedAt: null });
    await expect(offers.studentOffer(students[2], offer.id)).rejects.toThrow(
      'Offer is not available',
    );
  });

  it('supports chapter-only offers and rejects a course paired with its chapter', async () => {
    const chapter = { targetType: 'CHAPTER' as const, targetId: chapterId };
    await expect(
      offers.save(admin, saveOffer([targets()[0], chapter])),
    ).rejects.toThrow('An offer cannot contain a course and its chapter');
    const offer = await offers.save(admin, {
      ...saveOffer([chapter], 300, null),
      name: 'Chapter offer',
    });
    const order = await checkout(students[3], offer.id, 'chapter-offer');
    await approve(order.id);
    expect(
      await db.studentEntitlement.count({
        where: {
          studentUserId: students[3],
          chapterId,
          orderItem: { salesOfferPurchaseId: order.bundles[0].id },
          status: 'ACTIVE',
        },
      }),
    ).toBe(1);
  });

  it('approves a zero-price offer at checkout and grants its contents', async () => {
    const offer = await offers.save(admin, {
      ...saveOffer(targets(), 0),
      name: 'Free offer',
    });
    const order = await checkout(students[3], offer.id, 'free-offer');
    expect(order).toMatchObject({
      status: 'APPROVED',
      paymentChannel: 'ZERO_TOTAL',
      total: { amountMinor: 0 },
    });
    expect(
      await db.studentEntitlement.count({
        where: {
          orderItem: { salesOfferPurchaseId: order.bundles[0].id },
          status: 'ACTIVE',
        },
      }),
    ).toBe(2);
  });

  it('exposes authenticated catalog and administrator APIs with validation', async () => {
    const session = await db.authSession.create({
      data: {
        userId: students[2],
        refreshTokenHash: 'offer-test-token',
        familyId: 'offer-test-family',
        expiresAt: new Date(Date.now() + day),
      },
    });
    const token = app.get(TokenService).signUserAccessToken({
      userId: students[2],
      role: 'STUDENT',
      sessionId: session.id,
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'offer-admin@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    expect(login.statusCode).toBe(201);
    const adminHeaders = {
      authorization: `Bearer ${JSON.parse(login.body).accessToken}`,
    };
    const studentHeaders = { authorization: `Bearer ${token}` };
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/sales-offers',
      headers: adminHeaders,
      payload: saveOffer(targets(), 900, null),
    });
    expect(create.statusCode).toBe(201);
    const id = JSON.parse(create.body).id;
    const adminList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/sales-offers',
      headers: adminHeaders,
    });
    expect(adminList.statusCode).toBe(200);
    expect(
      JSON.parse(adminList.body).find((offer: any) => offer.id === id),
    ).toMatchObject({ soldCount: 0, remainingSpots: null });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/student/sales-offers/${id}`,
      headers: studentHeaders,
    });
    expect(detail.statusCode).toBe(200);
    expect(JSON.parse(detail.body)).toMatchObject({
      id,
      available: true,
      priceMinor: 900,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/sales-offers',
          headers: studentHeaders,
          payload: saveOffer(targets()),
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/admin/sales-offers',
          headers: adminHeaders,
          payload: saveOffer([{ targetType: 'BUNDLE', targetId: id }]),
        })
      ).statusCode,
    ).toBe(400);
  });

  it('approves concurrent zero-total checkouts with spare capacity and replays their keys', async () => {
    const offer = await offers.save(admin, saveOffer(targets(), 0, 10));
    await db.cartItem.deleteMany({
      where: { cart: { studentUserId: { in: students } } },
    });
    await Promise.all(
      students.map((student) =>
        commerce.addCartItem(student, {
          targetType: 'BUNDLE',
          targetId: offer.id,
        }),
      ),
    );
    const orders = await Promise.all(
      students.map((student, index) =>
        commerce.checkout(student, {}, `concurrent-free-${index}`),
      ),
    );
    expect(orders.every((order) => order.status === 'APPROVED')).toBe(true);
    expect(
      await db.salesOfferPurchase.count({
        where: { salesOfferId: offer.id, allocatedAt: { not: null } },
      }),
    ).toBe(4);
    for (const [index, student] of students.entries()) {
      const replay = await commerce.checkout(
        student,
        {},
        `concurrent-free-${index}`,
      );
      expect(replay.id).toBe(orders[index].id);
    }
    expect(
      await db.salesOfferPurchase.count({ where: { salesOfferId: offer.id } }),
    ).toBe(4);
  });

  const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };

  it.each(['archive', 'archiveIfUnreferenced'] as const)(
    'keeps an offer cover ready when its save wins a race with %s',
    async (method) => {
      const cover = await db.asset.create({
        data: {
          provider: 'BUNNY_STORAGE',
          kind: 'COVER_IMAGE',
          status: 'READY',
          originalFilename: 'race.png',
          filename: 'race.png',
          mimeType: 'image/png',
          storageKey: `${method}-save-wins.png`,
          uploadedById: admin.id,
        },
      });
      const assets = app.get(AssetsService);
      const validated = deferred();
      const releaseSave = deferred();
      const archiveEntered = deferred();
      const getReady = assets.getReady.bind(assets);
      const lock = assets.lockForReference.bind(assets);
      let lockCalls = 0;
      const lockSpy = jest
        .spyOn(assets, 'lockForReference')
        .mockImplementation(async (tx, id) => {
          if (id === cover.id && ++lockCalls === 2) archiveEntered.resolve();
          await lock(tx, id);
        });
      const readySpy = jest
        .spyOn(assets, 'getReady')
        .mockImplementation(async (id, tx) => {
          const result = await getReady(id, tx);
          if (id === cover.id) {
            validated.resolve();
            await releaseSave.promise;
          }
          return result;
        });
      try {
        const saving = offers.save(admin, {
          ...saveOffer(targets(), 100, null),
          coverAssetId: cover.id,
        });
        await validated.promise;
        // Attach rejection handling immediately while the transaction waits.
        const archiving = Promise.allSettled([assets[method](admin, cover.id)]);
        await archiveEntered.promise;
        releaseSave.resolve();
        const offer = await saving;
        const [outcome] = await archiving;
        expect(outcome.status).toBe(
          method === 'archive' ? 'rejected' : 'fulfilled',
        );
        if (outcome.status === 'rejected')
          expect(outcome.reason.message).toBe(
            'Referenced assets cannot be archived',
          );
        expect(
          (await db.asset.findUniqueOrThrow({ where: { id: cover.id } }))
            .status,
        ).toBe('READY');
        await expect(
          offers.studentCover(students[0], offer.id),
        ).resolves.toHaveProperty('url');
      } finally {
        releaseSave.resolve();
        readySpy.mockRestore();
        lockSpy.mockRestore();
      }
    },
  );

  it.each(['archive', 'archiveIfUnreferenced'] as const)(
    'rejects an offer cover when %s wins the race',
    async (method) => {
      const cover = await db.asset.create({
        data: {
          provider: 'BUNNY_STORAGE',
          kind: 'COVER_IMAGE',
          status: 'READY',
          originalFilename: 'race.png',
          filename: 'race.png',
          mimeType: 'image/png',
          storageKey: `${method}-archive-wins.png`,
          uploadedById: admin.id,
        },
      });
      const assets = app.get(AssetsService);
      const checked = deferred();
      const releaseArchive = deferred();
      const saveEntered = deferred();
      const isReferenced = assets.isReferenced.bind(assets);
      const lock = assets.lockForReference.bind(assets);
      let lockCalls = 0;
      const lockSpy = jest
        .spyOn(assets, 'lockForReference')
        .mockImplementation(async (tx, id) => {
          if (id === cover.id && ++lockCalls === 2) saveEntered.resolve();
          await lock(tx, id);
        });
      const referenceSpy = jest
        .spyOn(assets, 'isReferenced')
        .mockImplementation(async (id, tx) => {
          const result = await isReferenced(id, tx);
          if (id === cover.id) {
            checked.resolve();
            await releaseArchive.promise;
          }
          return result;
        });
      try {
        const archiving = assets[method](admin, cover.id);
        await checked.promise;
        const saving = Promise.allSettled([
          offers.save(admin, {
            ...saveOffer(targets(), 100, null),
            coverAssetId: cover.id,
          }),
        ]);
        await saveEntered.promise;
        releaseArchive.resolve();
        await archiving;
        const [outcome] = await saving;
        expect(outcome.status).toBe('rejected');
        if (outcome.status === 'rejected')
          expect(outcome.reason.message).toBe('Asset is not ready');
        expect(
          await db.salesOffer.count({ where: { coverAssetId: cover.id } }),
        ).toBe(0);
        expect(
          (await db.asset.findUniqueOrThrow({ where: { id: cover.id } }))
            .status,
        ).toBe('ARCHIVED');
      } finally {
        releaseArchive.resolve();
        referenceSpy.mockRestore();
        lockSpy.mockRestore();
      }
    },
  );
});
