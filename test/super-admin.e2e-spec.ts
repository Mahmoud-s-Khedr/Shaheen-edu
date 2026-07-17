/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';

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
});
