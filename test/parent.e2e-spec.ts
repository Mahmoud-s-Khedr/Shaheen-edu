/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import {
  CommerceTargetType,
  ContentStatus,
  EntitlementStatus,
  OrderStatus,
  Role,
} from '../src/common/types/roles.enum';

const childA = {
  fullName: 'Child A',
  nationalId: '29903030312341',
  phone: '01055551111',
  parentPhone: '01066662222',
  governorate: 'Giza',
  password: 'ChildAP@ss1!',
};

const childB = {
  fullName: 'Child B',
  nationalId: '29903030312342',
  phone: '01055553333',
  parentPhone: '01066662222', // same parent as child A
  governorate: 'Giza',
  password: 'ChildBP@ss1!',
};

const unrelatedChild = {
  fullName: 'Unrelated Child',
  nationalId: '29903030312343',
  phone: '01055559999',
  parentPhone: '01099990000', // different parent
  governorate: 'Giza',
  password: 'UnrelatedP@ss1!',
};

describe('Parent (e2e)', () => {
  let app: NestFastifyApplication;
  let childAUserId: string;
  let childBUserId: string;
  let unrelatedChildUserId: string;
  let academicGradeId: string;
  let governorateId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    academicGradeId = (
      await seedPublishedAcademicGrade(app, 'parent-e2e-grade')
    ).id;
    governorateId = (
      await app.get(PrismaService).governorate.create({
        data: { nameAr: 'الجيزة', nameEn: 'Giza' },
      })
    ).id;

    for (const payload of [childA, childB, unrelatedChild]) {
      const { governorate: _governorate, ...registration } = payload;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: { ...registration, academicGradeId, governorateId },
      });
      const body = JSON.parse(response.body);
      if (payload === childA) childAUserId = body.user.id;
      if (payload === childB) childBUserId = body.user.id;
      if (payload === unrelatedChild) unrelatedChildUserId = body.user.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // Parent login has a strict rate limit (3 attempts/30min per identifier).
  // Flush between tests so each test's own login attempts don't trip the
  // limiter due to the other tests in this file also logging in as the
  // same parent.
  beforeEach(async () => {
    await flushTestRedis(app);
  });

  it('authenticates with the correct (nationalId, parentPhone) pair', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).accessToken).toBeDefined();
  });

  it('rejects a wrong national id with a generic error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: '29903030399999',
        parentPhone: childA.parentPhone,
      },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a wrong parent phone with the same generic error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: { nationalId: childA.nationalId, parentPhone: '01000000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects malformed parent phone numbers with a validation error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: { nationalId: childA.nationalId, parentPhone: '01312345678' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('accepts a country-code-form parent phone', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: '+20 10 6666 2222',
      },
    });
    expect(response.statusCode).toBe(201);
  });

  it('lists multiple children for the same parent phone', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/children',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    const children = JSON.parse(response.body);
    expect(children.data).toHaveLength(2);
    expect(children.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it('paginates children and rejects invalid pagination input', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const pagedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/children?page=2&limit=1',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(pagedResponse.statusCode).toBe(200);
    expect(JSON.parse(pagedResponse.body)).toMatchObject({
      data: [expect.any(Object)],
      meta: { page: 2, limit: 1, total: 2, totalPages: 2 },
    });

    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/children?page=0',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(invalidResponse.statusCode).toBe(400);
  });

  it('selects a child and can then read the selected child', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const selectResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/select-child',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { studentUserId: childAUserId },
    });
    expect(selectResponse.statusCode).toBe(201);
    const { accessToken: newToken } = JSON.parse(selectResponse.body);

    const selectedResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/selected-child',
      headers: { authorization: `Bearer ${newToken}` },
    });
    expect(selectedResponse.statusCode).toBe(200);
    expect(JSON.parse(selectedResponse.body).userId).toBe(childAUserId);
  });

  it('cannot select a child unrelated to this parent phone', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/select-child',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { studentUserId: unrelatedChildUserId },
    });
    expect(response.statusCode).toBe(403);
  });

  it('discovers only selected-child active entitlement scopes and reads scoped analytics', async () => {
    const prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirstOrThrow({
      where: { role: Role.SUPER_ADMIN },
    });
    const subject = await prisma.subject.create({
      data: {
        academicGradeId,
        title: 'Parent analytics subject',
        slug: 'parent-analytics-subject',
        sortOrder: 1,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const course = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Parent analytics course',
        slug: 'parent-analytics-course',
        sortOrder: 1,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const method = await prisma.manualPaymentMethod.create({
      data: {
        titleAr: 'تحويل',
        instructionsAr: 'ادفع',
        sortOrder: 1,
        createdById: admin.id,
      },
    });
    const order = await prisma.order.create({
      data: {
        studentUserId: childAUserId,
        manualPaymentMethodId: method.id,
        paymentMethodSnapshot: {},
        subtotalMinor: 1000,
        totalMinor: 1000,
        currency: 'EGP',
        status: OrderStatus.APPROVED,
        approvedAt: new Date('2026-08-12T10:00:00.000Z'),
        items: {
          create: {
            targetType: CommerceTargetType.COURSE,
            courseId: course.id,
            titleSnapshot: course.title,
            basePriceMinor: 1000,
            priceMinor: 1000,
            currency: 'EGP',
          },
        },
      },
      include: { items: true },
    });
    const createApprovedCourseOrder = (titleSnapshot: string) =>
      prisma.order.create({
        data: {
          studentUserId: childAUserId,
          manualPaymentMethodId: method.id,
          paymentMethodSnapshot: {},
          subtotalMinor: 1000,
          totalMinor: 1000,
          currency: 'EGP',
          status: OrderStatus.APPROVED,
          approvedAt: new Date(),
          items: {
            create: {
              targetType: CommerceTargetType.COURSE,
              courseId: course.id,
              titleSnapshot,
              basePriceMinor: 1000,
              priceMinor: 1000,
              currency: 'EGP',
            },
          },
        },
        include: { items: true },
      });
    const [revokedOrder, expiredOrder] = await Promise.all([
      createApprovedCourseOrder('Revoked historical purchase'),
      createApprovedCourseOrder('Expired historical purchase'),
    ]);
    const manualCourse = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Parent analytics manual grant course',
        slug: 'parent-analytics-manual-grant-course',
        sortOrder: 2,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const chapterOnlyCourse = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Parent analytics chapter-only course',
        slug: 'parent-analytics-chapter-only-course',
        sortOrder: 3,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const [coveredChapter, firstChapterOnly, secondChapterOnly] =
      await Promise.all([
        prisma.chapter.create({
          data: {
            courseId: course.id,
            title: 'Covered by course access chapter',
            slug: 'covered-by-course-access-chapter',
            sortOrder: 1,
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            createdById: admin.id,
            updatedById: admin.id,
          },
        }),
        prisma.chapter.create({
          data: {
            courseId: chapterOnlyCourse.id,
            title: 'First chapter-only access',
            slug: 'first-chapter-only-access',
            sortOrder: 1,
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            createdById: admin.id,
            updatedById: admin.id,
          },
        }),
        prisma.chapter.create({
          data: {
            courseId: chapterOnlyCourse.id,
            title: 'Second chapter-only access',
            slug: 'second-chapter-only-access',
            sortOrder: 2,
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(),
            createdById: admin.id,
            updatedById: admin.id,
          },
        }),
      ]);
    const [
      activeCourse,
      revoked,
      expired,
      manual,
      coveredChapterGrant,
      firstChapterGrant,
      secondChapterGrant,
      future,
      unselectedChildGrant,
      unrelatedChildGrant,
    ] = await Promise.all([
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          courseId: course.id,
          orderItemId: order.items[0].id,
          source: 'PAYMENT',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          courseId: course.id,
          orderItemId: revokedOrder.items[0].id,
          source: 'PAYMENT',
          status: EntitlementStatus.REVOKED,
          revokedAt: new Date(),
          revokedById: admin.id,
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          courseId: course.id,
          orderItemId: expiredOrder.items[0].id,
          source: 'PAYMENT',
          expiresAt: new Date(Date.now() - 60_000),
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          courseId: manualCourse.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          chapterId: coveredChapter.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          chapterId: firstChapterOnly.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          chapterId: secondChapterOnly.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childAUserId,
          courseId: manualCourse.id,
          source: 'ADMIN',
          startsAt: new Date(Date.now() + 60_000),
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: childBUserId,
          courseId: manualCourse.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
      prisma.studentEntitlement.create({
        data: {
          studentUserId: unrelatedChildUserId,
          courseId: manualCourse.id,
          source: 'ADMIN',
          grantedById: admin.id,
        },
      }),
    ]);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const selected = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/select-child',
      headers: {
        authorization: `Bearer ${JSON.parse(login.body).accessToken}`,
      },
      payload: { studentUserId: childAUserId },
    });
    const headers = {
      authorization: `Bearer ${JSON.parse(selected.body).accessToken}`,
    };

    const scopes = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/selected-child/analytics/scopes',
      headers,
    });
    expect(scopes.statusCode).toBe(200);
    const body = JSON.parse(scopes.body);
    const grants = body.data.find(
      (group: any) => group.subject.id === subject.id,
    ).accessGrants;
    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entitlementId: activeCourse.id,
          source: 'PAYMENT',
          orderId: order.id,
          orderItemId: order.items[0].id,
          target: { type: 'COURSE', id: course.id, title: course.title },
        }),
        expect.objectContaining({
          entitlementId: manual.id,
          source: 'ADMIN',
          orderId: null,
          orderItemId: null,
          target: {
            type: 'COURSE',
            id: manualCourse.id,
            title: manualCourse.title,
          },
        }),
        expect.objectContaining({
          entitlementId: firstChapterGrant.id,
          target: {
            type: 'CHAPTER',
            id: firstChapterOnly.id,
            title: firstChapterOnly.title,
          },
        }),
        expect.objectContaining({
          entitlementId: secondChapterGrant.id,
          target: {
            type: 'CHAPTER',
            id: secondChapterOnly.id,
            title: secondChapterOnly.title,
          },
        }),
      ]),
    );
    expect(grants).toHaveLength(4);
    expect(
      grants.filter((grant: any) => grant.target.id === course.id),
    ).toHaveLength(1);
    expect(grants.map((grant: any) => grant.entitlementId)).not.toEqual(
      expect.arrayContaining([
        revoked.id,
        expired.id,
        future.id,
        coveredChapterGrant.id,
      ]),
    );

    for (const resource of ['content', 'assessments', 'practice']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/parent/selected-child/analytics/${resource}?orderItemId=${order.items[0].id}`,
        headers,
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).scope.orderItemId).toBe(
        order.items[0].id,
      );
    }

    const foreign = await app.inject({
      method: 'GET',
      url: '/api/v1/parent/selected-child/analytics/content?orderItemId=missing',
      headers,
    });
    expect(foreign.statusCode).toBe(404);

    for (const inactiveOrderItemId of [
      revokedOrder.items[0].id,
      expiredOrder.items[0].id,
    ]) {
      const inactive = await app.inject({
        method: 'GET',
        url: `/api/v1/parent/selected-child/analytics/content?orderItemId=${inactiveOrderItemId}`,
        headers,
      });
      expect(inactive.statusCode).toBe(404);
    }

    const exact = await app.inject({
      method: 'GET',
      url: `/api/v1/parent/selected-child/analytics/content?entitlementId=${manual.id}`,
      headers,
    });
    expect(exact.statusCode).toBe(200);
    expect(JSON.parse(exact.body).scope).toMatchObject({
      entitlementId: manual.id,
      source: 'ADMIN',
      orderId: null,
      orderItemId: null,
    });

    for (const foreignEntitlementId of [
      unselectedChildGrant.id,
      unrelatedChildGrant.id,
    ]) {
      const foreignEntitlement = await app.inject({
        method: 'GET',
        url: `/api/v1/parent/selected-child/analytics/content?entitlementId=${foreignEntitlementId}`,
        headers,
      });
      expect(foreignEntitlement.statusCode).toBe(404);
    }
  });

  it('is blocked from /api/v1/admin/* routes', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: childA.nationalId,
        parentPhone: childA.parentPhone,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // Parent access tokens are a different token type; UserAuthGuard rejects
    // them outright (401) before RolesGuard/SuperAdminGuard would even run.
    expect(response.statusCode).toBe(401);
  });
});
