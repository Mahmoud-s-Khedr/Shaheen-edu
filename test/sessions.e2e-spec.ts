/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';

const studentPayload = {
  fullName: 'Session Student',
  nationalId: '29904040412345',
  phone: '01077778888',
  parentPhone: '01066665555',
  governorate: 'Alexandria',
  password: 'SessionP@ss1!',
};

function extractCookie(response: {
  cookies: { name: string; value: string }[];
}): string {
  const cookie = response.cookies.find((c) => c.name === 'refresh_token');
  if (!cookie) throw new Error('refresh_token cookie not set');
  return cookie.value;
}

describe('Sessions (e2e)', () => {
  let app: NestFastifyApplication;
  let academicGradeId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    academicGradeId = (
      await seedPublishedAcademicGrade(app, 'sessions-e2e-grade')
    ).id;
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
    };
  }

  it('refresh rotation issues a new token pair', async () => {
    const { refreshToken } = await registerFreshStudent('1001');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    expect(response.statusCode).toBe(201);
    const newRefreshToken = extractCookie(response);
    expect(newRefreshToken).not.toBe(refreshToken);
  });

  it('reusing a revoked (already-rotated) refresh token is rejected and invalidates the whole family', async () => {
    const { refreshToken } = await registerFreshStudent('1002');

    const rotateResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    const newRefreshToken = extractCookie(rotateResponse);

    // Reuse the OLD (now-revoked) token.
    const reuseResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: refreshToken },
    });
    expect(reuseResponse.statusCode).toBe(401);

    // The NEW token (same family) must now also be revoked.
    const followUpResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: newRefreshToken },
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
          cookies: { refresh_token: refreshToken },
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
      cookies: { refresh_token: extractCookie(successfulResponse) },
    });
    expect(followUpResponse.statusCode).toBe(401);
  });

  it('logout revokes the current session', async () => {
    const { refreshToken, accessToken } = await registerFreshStudent('1003');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      cookies: { refresh_token: refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(201);

    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(meResponse.statusCode).toBe(401);
  });

  it('logout-all revokes all sessions for the user', async () => {
    const first = await registerFreshStudent('1004');
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: first.phone, password: first.password },
    });
    const second = JSON.parse(loginResponse.body);

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: { authorization: `Bearer ${first.accessToken}` },
    });

    const secondMeResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(secondMeResponse.statusCode).toBe(401);
  });

  it('password change invalidates existing sessions', async () => {
    const first = await registerFreshStudent('1005');
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: first.phone, password: first.password },
    });
    const second = JSON.parse(loginResponse.body);

    const changeResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: { oldPassword: first.password, newPassword: 'NewSessionP@ss1!' },
    });
    expect(changeResponse.statusCode).toBe(201);

    const secondMeResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(secondMeResponse.statusCode).toBe(401);
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
      cookies: { refresh_token: refreshToken },
    });
    expect(response.statusCode).toBe(401);
  });
});
