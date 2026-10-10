/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse JSON responses */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { PartnerType } from '../src/common/types/roles.enum';

describe('Partner admin-set password (e2e)', () => {
  let app: NestFastifyApplication;
  let adminToken: string;
  let prisma: PrismaService;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    prisma = app.get(PrismaService);
    const email = 'partner-reset-admin@example.com';
    const password = 'AdminPassword123!';
    await seedSuperAdmin(app, email, password);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: { email, password },
    });
    expect(login.statusCode).toBe(201);
    adminToken = JSON.parse(login.body).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([PartnerType.CONTENT_PUBLISHER, PartnerType.REFERRAL_PARTNER])(
    'sets a password for %s and allows immediate access and voluntary change',
    async (partnerType) => {
      const email = `${partnerType.toLowerCase()}-reset@example.com`;
      const originalPassword = 'OriginalPassword123!';
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/partners',
        headers: bearer(adminToken),
        payload: {
          email,
          password: originalPassword,
          partnerType,
          displayName: partnerType,
        },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).id as string;
      const url = `/api/v1/admin/partners/${id}/reset-password`;
      const login = async (password: string) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/partners/login',
          payload: { email, password },
        });
      const originalLogin = await login(originalPassword);
      expect(originalLogin.statusCode).toBe(201);
      const originalToken = JSON.parse(originalLogin.body)
        .accessToken as string;
      const before = await prisma.user.findUniqueOrThrow({ where: { id } });
      const invalid = await app.inject({
        method: 'POST',
        url,
        headers: bearer(adminToken),
        payload: {},
      });
      expect(invalid.statusCode).toBe(400);
      const unchanged = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(unchanged.passwordHash).toBe(before.passwordHash);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/partners/me',
            headers: bearer(originalToken),
          })
        ).statusCode,
      ).toBe(200);
      await prisma.user.update({
        where: { id },
        data: { mustChangePassword: true },
      });
      const chosenPassword = ' AdminChosenPassword123! ';
      const reset = await app.inject({
        method: 'POST',
        url,
        headers: bearer(adminToken),
        payload: { password: chosenPassword },
      });
      expect(reset.statusCode).toBe(200);
      expect(JSON.parse(reset.body)).toEqual({ success: true });
      const updated = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(updated.mustChangePassword).toBe(false);
      expect(updated.passwordResetAt).toBeInstanceOf(Date);
      expect(updated.loginIdentifier).toBe(email);
      expect(updated.passwordHash).not.toBe(before.passwordHash);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/partners/me',
            headers: bearer(originalToken),
          })
        ).statusCode,
      ).toBe(401);
      expect((await login(originalPassword)).statusCode).toBe(401);
      const newLogin = await login(chosenPassword);
      expect(newLogin.statusCode).toBe(201);
      expect(JSON.parse(newLogin.body).user.mustChangePassword).toBe(false);
      const token = JSON.parse(newLogin.body).accessToken as string;
      const profile = await app.inject({
        method: 'GET',
        url: '/api/v1/partners/me',
        headers: bearer(token),
      });
      expect(profile.statusCode).toBe(200);
      expect(JSON.parse(profile.body).id).toBe(id);
      const audit = await prisma.adminAuditLog.findFirstOrThrow({
        where: { targetId: id, action: 'PARTNER_PASSWORD_RESET' },
      });
      expect(JSON.stringify(audit)).not.toContain(chosenPassword);
      const changed = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: bearer(token),
        payload: {
          oldPassword: chosenPassword,
          newPassword: 'PartnerChosenPassword123!',
        },
      });
      expect(changed.statusCode).toBe(201);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/partners/me',
            headers: bearer(token),
          })
        ).statusCode,
      ).toBe(401);
      expect((await login('PartnerChosenPassword123!')).statusCode).toBe(201);
    },
  );
});
