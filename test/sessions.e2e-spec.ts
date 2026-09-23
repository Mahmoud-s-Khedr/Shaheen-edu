/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
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
import {
  AccountStatus,
  PartnerType,
  Role,
} from '../src/common/types/roles.enum';
import * as argon2 from 'argon2';

const studentPayload = {
  fullName: 'Session Student',
  nationalId: '29904040412345',
  phone: '01077778888',
  parentPhone: '01066665555',
  password: 'SessionP@ss1!',
};

function extractCookie(response: {
  cookies: { name: string; value: string }[];
}): string {
  const cookie = response.cookies.find((c) => c.name === 'app_refresh_token');
  if (!cookie) throw new Error('app_refresh_token cookie not set');
  return cookie.value;
}

function cookieByName(
  response: { cookies: { name: string; value: string }[] },
  name: string,
): string {
  const cookie = response.cookies.find((candidate) => candidate.name === name);
  if (!cookie) throw new Error(`${name} cookie not set`);
  return cookie.value;
}

const appOrigin = { origin: 'https://app.jibal-platform.com' };
const adminOrigin = { origin: 'https://admin.jibal-platform.com' };

describe('Sessions (e2e)', () => {
  let app: NestFastifyApplication;
  let academicGradeId: string;
  let governorateId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    academicGradeId = (
      await seedPublishedAcademicGrade(app, 'sessions-e2e-grade')
    ).id;
    governorateId = (await seedGovernorate(app, 'Alexandria')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await flushTestRedis(app);
  });

  async function registerFreshStudent(phoneSuffix: string) {
    const payload = {
      ...studentPayload,
      academicGradeId,
      governorateId,
      phone: `0107777${phoneSuffix}`,
      nationalId: `2990404041${phoneSuffix}`,
    };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload,
    });
    const body = JSON.parse(response.body);
    return {
      refreshToken: extractCookie(response),
      accessToken: body.accessToken,
      phone: payload.phone,
      password: payload.password,
      nationalId: payload.nationalId,
      parentPhone: payload.parentPhone,
      cookieNames: response.cookies.map((cookie) => cookie.name),
    };
  }

  it('refresh rotation issues a new token pair', async () => {
    const { refreshToken, cookieNames } = await registerFreshStudent('1001');
    expect(cookieNames).toEqual(['app_refresh_token']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: refreshToken },
    });
    expect(response.statusCode).toBe(201);
    const newRefreshToken = extractCookie(response);
    expect(newRefreshToken).not.toBe(refreshToken);
  });

  it('keeps app and admin refresh sessions isolated in one browser', async () => {
    const appSession = await registerFreshStudent('1010');
    await seedSuperAdmin(
      app,
      'session-isolation-admin@example.com',
      'SuperAdminP@ss1!',
    );
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'session-isolation-admin@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    const adminRefreshToken = adminLogin.cookies.find(
      (cookie) => cookie.name === 'admin_refresh_token',
    )?.value;
    if (!adminRefreshToken) {
      throw new Error('admin_refresh_token cookie not set');
    }
    expect(adminLogin.cookies.map((cookie) => cookie.name)).toEqual([
      'admin_refresh_token',
    ]);

    const appRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://app.jibal-platform.com' },
      cookies: {
        app_refresh_token: appSession.refreshToken,
        admin_refresh_token: adminRefreshToken,
      },
    });
    expect(appRefresh.statusCode).toBe(201);
    expect(JSON.parse(appRefresh.body).user.role).toBe('STUDENT');
    expect(appRefresh.cookies.map((cookie) => cookie.name)).toEqual([
      'app_refresh_token',
    ]);

    const adminRefresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://admin.jibal-platform.com' },
      cookies: {
        app_refresh_token: appSession.refreshToken,
        admin_refresh_token: adminRefreshToken,
      },
    });
    expect(adminRefresh.statusCode).toBe(201);
    expect(JSON.parse(adminRefresh.body).user.role).toBe('SUPER_ADMIN');
    expect(adminRefresh.cookies.map((cookie) => cookie.name)).toEqual([
      'admin_refresh_token',
    ]);
  });

  it('uses and clears the admin cookie namespace for partner sessions', async () => {
    const prisma = app.get(PrismaService);
    const creator = await seedSuperAdmin(
      app,
      'partner-cookie-creator@example.com',
      'SuperAdminP@ss1!',
    );
    await prisma.user.create({
      data: {
        role: Role.PARTNER,
        status: AccountStatus.ACTIVE,
        loginIdentifier: 'partner-cookie@example.com',
        passwordHash: await argon2.hash('PartnerP@ss1!'),
        partnerProfile: {
          create: {
            partnerType: PartnerType.CONTENT_PUBLISHER,
            displayName: 'Cookie partner',
            createdByAdminId: creator.id,
          },
        },
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/partners/login',
      payload: {
        email: 'partner-cookie@example.com',
        password: 'PartnerP@ss1!',
      },
    });
    expect(login.statusCode).toBe(201);
    expect(login.cookies.map((cookie) => cookie.name)).toContain(
      'admin_refresh_token',
    );
    expect(login.cookies.map((cookie) => cookie.name)).not.toContain(
      'app_refresh_token',
    );

    const refreshToken = cookieByName(login, 'admin_refresh_token');
    const accessToken = JSON.parse(login.body).accessToken as string;
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { admin_refresh_token: refreshToken },
    });
    expect(logout.statusCode).toBe(201);
    expect(logout.cookies.map((cookie) => cookie.name)).toContain(
      'admin_refresh_token',
    );
    expect(logout.cookies.map((cookie) => cookie.name)).not.toContain(
      'app_refresh_token',
    );

    const relogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/partners/login',
      payload: {
        email: 'partner-cookie@example.com',
        password: 'PartnerP@ss1!',
      },
    });
    const passwordChange = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: {
        authorization: `Bearer ${JSON.parse(relogin.body).accessToken as string}`,
      },
      cookies: {
        admin_refresh_token: cookieByName(relogin, 'admin_refresh_token'),
      },
      payload: {
        oldPassword: 'PartnerP@ss1!',
        newPassword: 'NewPartnerP@ss1!',
      },
    });
    expect(passwordChange.statusCode).toBe(201);
    expect(passwordChange.cookies.map((cookie) => cookie.name)).toContain(
      'admin_refresh_token',
    );

    const loginAfterPasswordChange = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/partners/login',
      payload: {
        email: 'partner-cookie@example.com',
        password: 'NewPartnerP@ss1!',
      },
    });
    const logoutAll = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: {
        authorization: `Bearer ${JSON.parse(loginAfterPasswordChange.body).accessToken as string}`,
      },
      cookies: {
        admin_refresh_token: cookieByName(
          loginAfterPasswordChange,
          'admin_refresh_token',
        ),
      },
    });
    expect(logoutAll.statusCode).toBe(201);
    expect(logoutAll.cookies.map((cookie) => cookie.name)).toContain(
      'admin_refresh_token',
    );
    expect(logoutAll.cookies.map((cookie) => cookie.name)).not.toContain(
      'app_refresh_token',
    );
  });

  it('rejects unrecognized origins, missing origins, and the wrong namespace', async () => {
    const appSession = await registerFreshStudent('1011');
    await seedSuperAdmin(
      app,
      'wrong-namespace-admin@example.com',
      'SuperAdminP@ss1!',
    );
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'wrong-namespace-admin@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    const adminRefreshToken = cookieByName(adminLogin, 'admin_refresh_token');

    const rejected = [
      {},
      { origin: 'https://jibal-platform.com' },
      { origin: 'https://www.jibal-platform.com' },
      { origin: 'https://unknown.jibal-platform.com' },
      { origin: 'not an origin' },
    ];
    for (const headers of rejected) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers,
        cookies: { app_refresh_token: appSession.refreshToken },
      });
      expect(response.statusCode).toBe(401);
    }

    const appUsingAdminCookie = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { admin_refresh_token: adminRefreshToken },
    });
    expect(appUsingAdminCookie.statusCode).toBe(401);

    const adminUsingAppCookie = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: adminOrigin,
      cookies: { app_refresh_token: appSession.refreshToken },
    });
    expect(adminUsingAppCookie.statusCode).toBe(401);
  });

  it('reusing a revoked (already-rotated) refresh token is rejected and invalidates the whole family', async () => {
    const { refreshToken } = await registerFreshStudent('1002');

    const rotateResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: refreshToken },
    });
    const newRefreshToken = extractCookie(rotateResponse);

    // Reuse the OLD (now-revoked) token.
    const reuseResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: refreshToken },
    });
    expect(reuseResponse.statusCode).toBe(401);

    // The NEW token (same family) must now also be revoked.
    const followUpResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: newRefreshToken },
    });
    expect(followUpResponse.statusCode).toBe(401);
  });

  it('allows only one concurrent refresh and revokes its successor on reuse', async () => {
    const { refreshToken } = await registerFreshStudent('1007');

    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          headers: appOrigin,
          cookies: { app_refresh_token: refreshToken },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 401,
    ]);

    const successfulResponse = responses.find(
      (response) => response.statusCode === 201,
    );
    if (!successfulResponse) throw new Error('Expected one successful refresh');

    const followUpResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: extractCookie(successfulResponse) },
    });
    expect(followUpResponse.statusCode).toBe(401);
  });

  it('logout revokes the current session', async () => {
    const { refreshToken, accessToken } = await registerFreshStudent('1003');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { app_refresh_token: refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(201);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meResponse.statusCode).toBe(401);
  });

  it('allows only one of two simultaneous logins after a student device slot is freed', async () => {
    const first = await registerFreshStudent('1008');
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${first.accessToken}` },
      cookies: { app_refresh_token: first.refreshToken },
    });

    const responses = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/students/login',
          payload: { phone: first.phone, password: first.password },
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const conflict = responses.find((response) => response.statusCode === 409);
    expect(JSON.parse(conflict!.body)).toMatchObject({
      code: 'STUDENT_DEVICE_ALREADY_ACTIVE',
    });
  });

  it('logout-all revokes all sessions for the user', async () => {
    const first = await registerFreshStudent('1004');

    const logoutAllResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: { authorization: `Bearer ${first.accessToken}` },
    });
    expect(logoutAllResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: first.phone, password: first.password },
    });
    expect(loginResponse.statusCode).toBe(201);
  });

  it('an admin reset revokes the student session and frees the login slot', async () => {
    const first = await registerFreshStudent('1009');
    const student = await app.get(PrismaService).user.findUniqueOrThrow({
      where: { loginIdentifier: first.phone },
      select: { id: true },
    });
    await seedSuperAdmin(
      app,
      'sessions-reset-super-admin@example.com',
      'SuperAdminP@ss1!',
    );
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'sessions-reset-super-admin@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    const reset = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${student.id}/reset-session`,
      headers: {
        authorization: `Bearer ${JSON.parse(adminLogin.body).accessToken}`,
      },
    });
    expect(reset.statusCode).toBe(200);
    expect(JSON.parse(reset.body)).toMatchObject({ revokedSessionCount: 1 });

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: first.phone, password: first.password },
    });
    expect(login.statusCode).toBe(201);
  });

  it('password change invalidates existing sessions', async () => {
    const first = await registerFreshStudent('1005');
    const changeResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: { oldPassword: first.password, newPassword: 'NewSessionP@ss1!' },
    });
    expect(changeResponse.statusCode).toBe(201);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: first.phone, password: 'NewSessionP@ss1!' },
    });
    expect(loginResponse.statusCode).toBe(201);
  });

  it('keeps parent login bearer-only', async () => {
    const student = await registerFreshStudent('1012');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: student.nationalId,
        parentPhone: student.parentPhone,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      accessToken: expect.any(String),
    });
    expect(response.cookies).toHaveLength(0);
  });

  it('suspended account cannot refresh', async () => {
    const { refreshToken, phone } = await registerFreshStudent('1006');
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { loginIdentifier: phone },
      data: { status: 'SUSPENDED' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: appOrigin,
      cookies: { app_refresh_token: refreshToken },
    });
    expect(response.statusCode).toBe(401);
  });
});
