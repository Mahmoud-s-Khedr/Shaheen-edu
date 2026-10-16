/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';

describe('Admin (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let superAdminToken: string;
  let otherAdminId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    const superAdminEmail = 'sa-for-admin-test@example.com';
    const superAdminPassword = 'SuperAdminP@ss1!';
    await seedSuperAdmin(app, superAdminEmail, superAdminPassword);

    const saLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email: superAdminEmail, password: superAdminPassword },
    });
    const { accessToken: saToken } = JSON.parse(saLogin.body);
    superAdminToken = saToken;

    // Create the admin under test.
    await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${saToken}` },
      payload: {
        email: 'admin-under-test@example.com',
        password: 'AdminP@ss1!',
      },
    });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'admin-under-test@example.com',
        password: 'AdminP@ss1!',
      },
    });
    adminToken = JSON.parse(adminLogin.body).accessToken;

    // A second admin to attempt to suspend.
    const createOther = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${saToken}` },
      payload: { email: 'other-admin@example.com', password: 'AdminP@ss1!' },
    });
    otherAdminId = JSON.parse(createOther.body).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    'students',
    'partners',
    'admins',
    'publisher-agreements',
    'entitlements',
    'reports/commerce',
    'geography/governorates',
    'testimonials',
  ])('denies Admin reads of %s', async (area) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/${area}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it.each([
    'students/known-student/suspend',
    'partners/known-partner/suspend',
    'publisher-agreements/known-agreement/activate',
  ])('denies Admin writes to %s before lookup', async (area) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/${area}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('preserves Admin current-user and content access', async () => {
    for (const path of [
      'auth/me',
      'admin/academic-grades',
      'admin/question-banks',
      'admin/questions',
      'admin/assessments/grading/pending',
      'admin/question-reports',
      'admin/assessments/question-reports',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/${path}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.statusCode).toBe(200);
    }
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/video-feedback?studentId=known-student',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(filtered.statusCode).toBe(403);
  });

  it('CANNOT create another admin (403)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'blocked-admin@example.com', password: 'AdminP@ss1!' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('paginates administrators and partners', async () => {
    const adminsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/admins?page=1&limit=1',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(adminsResponse.statusCode).toBe(200);
    expect(JSON.parse(adminsResponse.body)).toMatchObject({
      data: [expect.objectContaining({ role: 'ADMIN' })],
      meta: { page: 1, limit: 1, total: 2, totalPages: 2 },
    });

    const partnersResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/partners?page=3&limit=1',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(partnersResponse.statusCode).toBe(200);
    expect(JSON.parse(partnersResponse.body)).toEqual({
      data: [],
      meta: { page: 3, limit: 1, total: 0, totalPages: 0 },
    });
  });

  it('CANNOT suspend another admin (403)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/admins/${otherAdminId}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it('Super Admin can create a partner', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/partners',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        email: 'partner-by-admin@example.com',
        password: 'PartnerP@ss1!',
        partnerType: 'CONTENT_PUBLISHER',
        displayName: 'Test Partner',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).displayName).toBe('Test Partner');

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/partners',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body)).toMatchObject({
      data: [
        expect.objectContaining({
          id: JSON.parse(response.body).id,
          displayName: 'Test Partner',
        }),
      ],
      meta: { total: 1 },
    });
  });

  it('filters partners by partner type', async () => {
    const createPartner = async (partnerType: string, email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/admin/partners',
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          email,
          password: 'PartnerP@ss1!',
          partnerType,
          displayName: `${partnerType} partner`,
        },
      });
    await createPartner('CONTENT_PUBLISHER', 'publisher-filter@example.com');
    await createPartner('REFERRAL_PARTNER', 'referral-filter@example.com');

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/partners?partnerType=REFERRAL_PARTNER&q=REFERRAL_PARTNER',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: [expect.objectContaining({ partnerType: 'REFERRAL_PARTNER' })],
    });
    expect(JSON.parse(response.body).data).toHaveLength(1);
  });
  it('offers Admin only active publisher IDs and display names with search and pagination', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/partners',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        email: 'selector@example.com',
        password: 'PublisherP@ss1!',
        partnerType: 'CONTENT_PUBLISHER',
        displayName: 'Selector Publisher',
      },
    });
    expect(created.statusCode).toBe(201);
    const publisherId = JSON.parse(created.body).id;
    const headers = { authorization: `Bearer ${adminToken}` };
    const read = () =>
      app.inject({
        method: 'GET',
        url: '/api/v1/admin/question-banks/publishers?q=Selector&page=1&limit=1',
        headers,
      });
    const response = await read();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: [{ userId: publisherId, displayName: 'Selector Publisher' }],
      meta: { total: 1, page: 1, limit: 1 },
    });
    expect(Object.keys(JSON.parse(response.body).data[0]).sort()).toEqual([
      'displayName',
      'userId',
    ]);
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/partners/${publisherId}/suspend`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(JSON.parse((await read()).body).data).toEqual([]);
  });
});
