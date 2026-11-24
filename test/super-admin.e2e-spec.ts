/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';

describe('Super admin (e2e)', () => {
  let app: NestFastifyApplication;
  const email = 'superadmin.e2e@example.com';
  const password = 'SuperAdminP@ss1!';

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    await seedSuperAdmin(app, email, password);
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe('SUPER_ADMIN');
  });

  it('can create an admin via POST /api/v1/admin/admins', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        email: 'new-admin.e2e@example.com',
        password: 'NewAdminP@ss1!',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const body = JSON.parse(createResponse.body);
    expect(body.role).toBe('ADMIN');
    expect(body.loginIdentifier).toBe('new-admin.e2e@example.com');
  });

  it('deletes unused payment methods and preserves methods referenced by orders', async () => {
    const prisma = app.get(PrismaService);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password },
    });
    const auth = JSON.parse(login.body);
    const headers = { authorization: `Bearer ${auth.accessToken}` };
    const methods = await Promise.all(
      ['Unused', 'Used'].map(async (titleAr) => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/admin/manual-payment-methods',
          headers,
          payload: { titleAr, instructionsAr: 'Transfer instructions' },
        });
        expect(response.statusCode).toBe(201);
        return JSON.parse(response.body) as { id: string };
      }),
    );
    const url = (id: string) => `/api/v1/admin/manual-payment-methods/${id}`;
    expect(
      (await app.inject({ method: 'DELETE', url: url(methods[0].id) }))
        .statusCode,
    ).toBe(401);

    const regularAdmin = await seedSuperAdmin(
      app,
      'payment-delete-admin@example.com',
      password,
    );
    await prisma.user.update({
      where: { id: regularAdmin.id },
      data: { role: 'ADMIN' },
    });
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email: regularAdmin.loginIdentifier, password },
    });
    expect(adminLogin.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: url(methods[0].id),
          headers: {
            authorization: `Bearer ${JSON.parse(adminLogin.body).accessToken}`,
          },
        })
      ).statusCode,
    ).toBe(403);

    const deleted = await app.inject({
      method: 'DELETE',
      url: url(methods[0].id),
      headers,
    });
    expect(deleted.statusCode).toBe(200);
    expect(JSON.parse(deleted.body)).toEqual({
      id: methods[0].id,
      deleted: true,
    });
    expect(
      await prisma.manualPaymentMethod.findUnique({
        where: { id: methods[0].id },
      }),
    ).toBeNull();
    expect(
      await prisma.adminAuditLog.count({
        where: {
          action: 'MANUAL_PAYMENT_METHOD_DELETED',
          targetId: methods[0].id,
        },
      }),
    ).toBe(1);
    expect(
      (await app.inject({ method: 'DELETE', url: url(methods[0].id), headers }))
        .statusCode,
    ).toBe(404);

    const governorate = await prisma.governorate.create({
      data: { nameAr: 'Payment deletion test' },
    });
    const student = await prisma.user.create({
      data: {
        role: 'STUDENT',
        loginIdentifier: 'payment-deletion-student',
        passwordHash: 'unused',
        studentProfile: {
          create: {
            fullName: 'Payment deletion student',
            nationalIdHash: 'payment-deletion-national-id',
            nationalIdLast4: '1234',
            governorate: governorate.nameAr,
            governorateId: governorate.id,
            parentPhoneNormalized: '+201000000000',
          },
        },
      },
    });
    const order = await prisma.order.create({
      data: {
        studentUserId: student.id,
        manualPaymentMethodId: methods[1].id,
        totalMinor: 100,
        currency: 'EGP',
        paymentMethodSnapshot: { titleAr: 'Used' },
      },
    });
    const blocked = await app.inject({
      method: 'DELETE',
      url: url(methods[1].id),
      headers,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toContain('Deactivate');
    expect(
      await prisma.manualPaymentMethod.findUnique({
        where: { id: methods[1].id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.order.findUnique({ where: { id: order.id } }),
    ).toMatchObject({
      manualPaymentMethodId: methods[1].id,
      paymentMethodSnapshot: { titleAr: 'Used' },
    });
    expect(
      await prisma.adminAuditLog.count({
        where: {
          action: 'MANUAL_PAYMENT_METHOD_DELETED',
          targetId: methods[1].id,
        },
      }),
    ).toBe(0);
  });
});
