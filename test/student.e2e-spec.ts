/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis } from './utils/db';

const baseRegisterPayload = {
  fullName: 'Student E2E',
  nationalId: '29902020212345',
  phone: '01099998888',
  parentPhone: '01088887777',
  governorate: 'Cairo',
  password: 'StudentP@ss1!',
};

describe('Student (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: baseRegisterPayload,
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe('STUDENT');
    // National ID must never appear in any response body.
    expect(response.body).not.toContain('29902020212345');
  });

  it('rejects a duplicate phone number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...baseRegisterPayload,
        nationalId: '29902020298765',
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('rejects a duplicate national id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...baseRegisterPayload,
        phone: '01011112222',
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it('logs in successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: {
        phone: baseRegisterPayload.phone,
        password: baseRegisterPayload.password,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).accessToken).toBeDefined();
  });

  it('cannot set role via PATCH /students/me (whitelist rejects unknown fields)', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: {
        phone: baseRegisterPayload.phone,
        password: baseRegisterPayload.password,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const patchResponse = await app.inject({
      method: 'PATCH',
      url: '/api/v1/students/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { role: 'SUPER_ADMIN', fullName: 'Renamed Student' },
    });
    expect(patchResponse.statusCode).toBe(400);
  });

  it('is blocked from /api/v1/admin/* routes', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: {
        phone: baseRegisterPayload.phone,
        password: baseRegisterPayload.password,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('is blocked from /api/v1/partners/me', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: {
        phone: baseRegisterPayload.phone,
        password: baseRegisterPayload.password,
      },
    });
    const { accessToken } = JSON.parse(loginResponse.body);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/partners/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.statusCode).toBe(403);
  });
});
