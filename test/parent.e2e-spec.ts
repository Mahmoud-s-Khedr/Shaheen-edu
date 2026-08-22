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

  it('discovers approved purchased scopes and reads scoped analytics', async () => {
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
    expect(JSON.parse(scopes.body)).toMatchObject({
      data: [
        {
          subject: { id: subject.id, title: subject.title },
          purchases: [
            {
              orderId: order.id,
              orderItemId: order.items[0].id,
              target: { type: 'COURSE', id: course.id, title: course.title },
            },
          ],
        },
      ],
    });

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
