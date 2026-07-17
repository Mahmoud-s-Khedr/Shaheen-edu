/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis } from './utils/db';

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

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);

    for (const payload of [childA, childB, unrelatedChild]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload,
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
    expect(children.length).toBe(2);
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
