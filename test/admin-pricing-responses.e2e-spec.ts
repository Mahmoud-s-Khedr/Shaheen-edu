/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { ContentStatus } from '../src/common/types/roles.enum';
import type {
  OrderStatus,
  PaymentChannel,
  RefundRequestStatus,
} from '@prisma/client';

describe('Admin course and chapter pricing responses (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let courseId: string;
  let otherCourseId: string;
  let inheritedChapterId: string;
  let overriddenChapterId: string;
  let nonPurchasableChapterId: string;
  let lessonId: string;

  const json = (response: { body: string }) => JSON.parse(response.body);
  const admin = () => ({ authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    prisma = app.get(PrismaService);

    const email = 'admin-pricing-responses@example.com';
    await seedSuperAdmin(app, email, 'SuperAdminP@ss1!');
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password: 'SuperAdminP@ss1!' },
    });
    adminToken = json(login).accessToken;
    const actorId = json(login).user.id;

    const grade = await prisma.academicGrade.create({
      data: {
        titleAr: 'Pricing grade',
        slug: 'pricing-grade',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const subject = await prisma.subject.create({
      data: {
        gradeAssignments: {
          create: { academicGradeId: grade.id, sortOrder: 1 },
        },
        title: 'Pricing subject',
        slug: 'pricing-subject',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const course = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Paid course',
        slug: 'paid-course',
        sortOrder: 1,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    const otherCourse = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Free course',
        slug: 'free-course',
        sortOrder: 2,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    courseId = course.id;
    otherCourseId = otherCourse.id;

    const [inherited, overridden, nonPurchasable] = await Promise.all([
      prisma.chapter.create({
        data: {
          courseId,
          title: 'Inherited',
          slug: 'inherited',
          sortOrder: 1,
          createdById: actorId,
          updatedById: actorId,
        },
      }),
      prisma.chapter.create({
        data: {
          courseId,
          title: 'Override',
          slug: 'override',
          sortOrder: 2,
          createdById: actorId,
          updatedById: actorId,
        },
      }),
      prisma.chapter.create({
        data: {
          courseId,
          title: 'Not purchasable',
          slug: 'not-purchasable',
          sortOrder: 3,
          createdById: actorId,
          updatedById: actorId,
        },
      }),
    ]);
    inheritedChapterId = inherited.id;
    overriddenChapterId = overridden.id;
    nonPurchasableChapterId = nonPurchasable.id;
    lessonId = (
      await prisma.lesson.create({
        data: {
          chapterId: inherited.id,
          title: 'Lesson',
          slug: 'lesson',
          sortOrder: 1,
          createdById: actorId,
          updatedById: actorId,
        },
      })
    ).id;
  });

  afterAll(async () => app.close());

  it('counts approved direct and bundle sales without free purchases, refunds, or component double counting', async () => {
    const governorate = await prisma.governorate.create({
      data: { nameAr: 'Sales count governorate' },
    });
    const student = await prisma.user.create({
      data: {
        role: 'STUDENT',
        loginIdentifier: 'sales-count-student',
        passwordHash: 'unused',
        studentProfile: {
          create: {
            fullName: 'Sales count student',
            nationalIdHash: 'sales-count-national-id',
            nationalIdLast4: '1234',
            governorate: governorate.nameAr,
            governorateId: governorate.id,
            parentPhoneNormalized: '+201000000000',
          },
        },
      },
    });
    const offer = await prisma.salesOffer.create({
      data: {
        name: 'Sales count bundle',
        priceMinor: 200,
        // Ended offers can retain allocated spots after refunds. Sales must
        // still exclude those refunds independently of capacity accounting.
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2020-02-01'),
        status: 'ENDED',
      },
    });
    const emptyOffer = await prisma.salesOffer.create({
      data: {
        name: 'Unsold bundle',
        priceMinor: 200,
        startsAt: new Date('2020-01-01'),
        endsAt: new Date('2020-02-01'),
      },
    });
    const variants: Array<{
      status: OrderStatus;
      channel?: PaymentChannel;
      price?: number;
      credit?: number;
      refund?: RefundRequestStatus;
    }> = [
      { status: 'APPROVED', channel: 'MANUAL' },
      { status: 'APPROVED', channel: 'XPAY' },
      { status: 'APPROVED', channel: 'ZERO_TOTAL', credit: 100 },
      { status: 'APPROVED', refund: 'PENDING' },
      { status: 'APPROVED', refund: 'REJECTED' },
      { status: 'APPROVED', refund: 'APPROVED' },
      { status: 'APPROVED', channel: 'ZERO_TOTAL', price: 0 },
      ...(
        [
          'AWAITING_PAYMENT',
          'SUBMITTED',
          'REJECTED',
          'CANCELLED',
          'EXPIRED',
          'PAYMENT_REVIEW',
        ] as OrderStatus[]
      ).map((status) => ({ status })),
    ];
    for (const bundle of [false, true]) {
      for (const variant of variants) {
        const price = variant.price ?? 100;
        const credit = variant.credit ?? 0;
        const order = await prisma.order.create({
          data: {
            studentUserId: student.id,
            status: variant.status,
            approvedAt: variant.status === 'APPROVED' ? new Date() : null,
            paymentChannel: variant.channel ?? 'MANUAL',
            paymentMethodSnapshot: {},
            subtotalMinor: price * 2,
            creditAppliedMinor: credit * 2,
            totalMinor: (price - credit) * 2,
            currency: 'EGP',
          },
        });
        const purchase = bundle
          ? await prisma.salesOfferPurchase.create({
              data: {
                salesOfferId: offer.id,
                studentUserId: student.id,
                orderId: order.id,
                snapshot: {},
                allocatedAt: variant.status === 'APPROVED' ? new Date() : null,
              },
            })
          : null;
        const items = await Promise.all(
          [
            { targetType: 'COURSE' as const, courseId },
            { targetType: 'CHAPTER' as const, chapterId: inheritedChapterId },
          ].map((target) =>
            prisma.orderItem.create({
              data: {
                ...target,
                orderId: order.id,
                salesOfferPurchaseId: purchase?.id,
                titleSnapshot: 'Sales count product',
                basePriceMinor: price,
                priceMinor: price,
                creditAppliedMinor: credit,
                currency: 'EGP',
              },
            }),
          ),
        );
        if (variant.refund)
          await prisma.refundRequest.create({
            data: {
              orderId: order.id,
              studentUserId: student.id,
              status: variant.refund,
              reason: 'Sales count refund',
              eligibilitySnapshot: {},
              items: {
                create: items.map((item) => ({
                  orderItemId: item.id,
                  amountMinor: price - credit,
                  creditReturnMinor: credit,
                  currency: 'EGP',
                })),
              },
            },
          });
      }
    }

    for (const [resource, id, unsoldId] of [
      ['courses', courseId, otherCourseId],
      ['chapters', inheritedChapterId, overriddenChapterId],
    ]) {
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/${resource}/${id}`,
        headers: admin(),
      });
      expect(detail.statusCode).toBe(200);
      expect(json(detail)).toMatchObject({ id, soldCount: 5 });
      // Exercise the Arabic-search path as well as regular pagination.
      for (const search of ['', '?q=Paid', '?q=Inherited']) {
        const list = await app.inject({
          method: 'GET',
          url: `/api/v1/admin/${resource}${search}`,
          headers: admin(),
        });
        expect(list.statusCode).toBe(200);
        const rows = json(list).data;
        if (
          !search ||
          (resource === 'courses'
            ? search === '?q=Paid'
            : search === '?q=Inherited')
        )
          expect(rows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id, soldCount: 5 }),
            ]),
          );
        if (!search)
          expect(rows).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: unsoldId, soldCount: 0 }),
            ]),
          );
      }
    }
    const bundles = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/sales-offers',
      headers: admin(),
    });
    expect(bundles.statusCode).toBe(200);
    expect(json(bundles)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: offer.id, soldCount: 5 }),
        expect.objectContaining({ id: emptyOffer.id, soldCount: 0 }),
      ]),
    );
  });

  it('returns effective pricing for course list and detail responses', async () => {
    const pricing = {
      isPurchasable: true,
      priceMinor: 20_000,
      currency: 'EGP',
    };
    const set = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/pricing/course/${courseId}`,
      headers: admin(),
      payload: pricing,
    });
    expect(set.statusCode).toBe(201);
    expect(json(set)).toMatchObject({ ...pricing, resolvedFrom: { courseId } });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/courses?subjectId=${(await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).subjectId}`,
      headers: admin(),
    });
    expect(list.statusCode).toBe(200);
    expect(json(list).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: courseId,
          pricing: expect.objectContaining({
            ...pricing,
            resolvedFrom: expect.objectContaining({
              courseId,
              courseName: 'Paid course',
            }),
          }),
        }),
        expect.objectContaining({
          id: otherCourseId,
          pricing: expect.objectContaining({
            isPurchasable: false,
            priceMinor: null,
            currency: null,
            resolvedFrom: expect.objectContaining({
              courseId: otherCourseId,
              courseName: 'Free course',
            }),
          }),
        }),
      ]),
    );

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/courses/${courseId}`,
      headers: admin(),
    });
    expect(detail.statusCode).toBe(200);
    expect(json(detail)).toMatchObject({
      id: courseId,
      pricing: { ...pricing, resolvedFrom: { courseId } },
    });
  });

  it('returns chapter overrides, inheritance, and non-purchasable effective pricing without leaking other-course records', async () => {
    const chapterPricing = {
      isPurchasable: true,
      priceMinor: 12_500,
      currency: 'EGP',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/pricing/chapter/${overriddenChapterId}`,
          headers: admin(),
          payload: chapterPricing,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/admin/pricing/chapter/${nonPurchasableChapterId}`,
          headers: admin(),
          payload: { isPurchasable: false },
        })
      ).statusCode,
    ).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/chapters?courseId=${courseId}`,
      headers: admin(),
    });
    expect(list.statusCode).toBe(200);
    const chapters = json(list).data;
    expect(chapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inheritedChapterId,
          pricing: expect.objectContaining({
            isPurchasable: true,
            priceMinor: 20_000,
            currency: 'EGP',
            resolvedFrom: expect.objectContaining({
              courseId,
              courseName: 'Paid course',
            }),
          }),
        }),
        expect.objectContaining({
          id: overriddenChapterId,
          pricing: expect.objectContaining({
            ...chapterPricing,
            resolvedFrom: expect.objectContaining({
              chapterId: overriddenChapterId,
              chapterName: 'Override',
            }),
          }),
        }),
        expect.objectContaining({
          id: nonPurchasableChapterId,
          pricing: expect.objectContaining({
            isPurchasable: false,
            priceMinor: null,
            currency: null,
            resolvedFrom: expect.objectContaining({
              chapterId: nonPurchasableChapterId,
              chapterName: 'Not purchasable',
            }),
          }),
        }),
      ]),
    );
    expect(chapters).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ courseId: otherCourseId }),
      ]),
    );

    const inheritedDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/chapters/${inheritedChapterId}`,
      headers: admin(),
    });
    expect(inheritedDetail.statusCode).toBe(200);
    expect(json(inheritedDetail)).toMatchObject({
      pricing: {
        isPurchasable: true,
        priceMinor: 20_000,
        currency: 'EGP',
        resolvedFrom: { courseId },
      },
    });
  });

  it('keeps pricing management endpoint behavior unchanged and protects the read endpoints', async () => {
    const setLesson = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/pricing/lesson/${lessonId}`,
      headers: admin(),
      payload: { isPurchasable: true, priceMinor: 5_000, currency: 'EGP' },
    });
    expect(setLesson.statusCode).toBe(201);
    expect(json(setLesson)).toMatchObject({
      isPurchasable: true,
      priceMinor: 5_000,
      currency: 'EGP',
      resolvedFrom: { lessonId },
    });

    const effective = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/pricing/effective?lessonId=${lessonId}`,
      headers: admin(),
    });
    expect(effective.statusCode).toBe(200);
    expect(json(effective)).toMatchObject({
      isPurchasable: true,
      priceMinor: 5_000,
      currency: 'EGP',
      resolvedFrom: { lessonId },
    });

    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/admin/courses/${courseId}`,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/admin/chapters/${inheritedChapterId}`,
        })
      ).statusCode,
    ).toBe(401);
  });
});
