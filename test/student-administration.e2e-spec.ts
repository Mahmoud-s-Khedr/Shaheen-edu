/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedPublishedAcademicGrade,
  seedSuperAdmin,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';

describe('Student administration (e2e)', () => {
  let app: NestFastifyApplication;
  let superAdminToken: string;
  let adminToken: string;
  let gradeId: string;
  let governorateId: string;
  let studentId: string;
  let studentAccessToken: string;
  const student = {
    fullName: 'Ahmed Student',
    nationalId: '29908080812345',
    phone: '01080808080',
    parentPhone: '01070707070',
    password: 'StudentP@ss1!',
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    await seedSuperAdmin(
      app,
      'student-admin-sa@example.com',
      'SuperAdminP@ss1!',
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'student-admin-sa@example.com',
        password: 'SuperAdminP@ss1!',
      },
    });
    superAdminToken = JSON.parse(login.body).accessToken;
    const createdAdmin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: {
        email: 'student-support@example.com',
        password: 'SupportP@ss1!',
      },
    });
    expect(createdAdmin.statusCode).toBe(201);
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'student-support@example.com',
        password: 'SupportP@ss1!',
      },
    });
    adminToken = JSON.parse(adminLogin.body).accessToken;
    gradeId = (
      await seedPublishedAcademicGrade(app, 'student-administration-grade')
    ).id;
    const prisma = app.get(PrismaService);
    governorateId = (
      await prisma.governorate.create({
        data: { nameAr: 'القاهرة', nameEn: 'Cairo' },
      })
    ).id;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: { ...student, academicGradeId: gradeId, governorateId },
    });
    expect(registration.statusCode).toBe(201);
    studentId = JSON.parse(registration.body).user.id;
    studentAccessToken = JSON.parse(registration.body).accessToken;
  });

  afterAll(async () => app.close());

  it('lists safe student data and supports filters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/students?search=ahmed&governorateId=${governorateId}&academicGradeId=${gradeId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(student.nationalId);
    expect(JSON.parse(response.body)).toMatchObject({
      data: [
        expect.objectContaining({
          id: studentId,
          fullName: student.fullName,
          phone: student.phone,
          nationalIdLast4: '2345',
          status: 'ACTIVE',
        }),
      ],
      meta: expect.objectContaining({ total: 1 }),
    });
  });

  it('sets a student password and allows login without forcing a password change', async () => {
    const temporaryPassword = '01000001010';
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reset-password`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { password: 'short' },
    });
    expect(invalid.statusCode).toBe(400);
    const reset = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reset-password`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { password: temporaryPassword },
    });
    expect(reset.statusCode).toBe(200);
    expect(JSON.parse(reset.body)).toEqual({ success: true });
    const originalSession = await app.inject({
      method: 'GET',
      url: '/api/v1/students/me',
      headers: { authorization: `Bearer ${studentAccessToken}` },
    });
    expect(originalSession.statusCode).toBe(401);
    const prisma = app.get(PrismaService);
    const audit = await prisma.adminAuditLog.findFirst({
      where: { action: 'STUDENT_PASSWORD_RESET', targetId: studentId },
    });
    expect(JSON.stringify(audit)).not.toContain(temporaryPassword);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: student.phone, password: temporaryPassword },
    });
    expect(login.statusCode).toBe(201);
    // Changing the admin-issued password is optional for students.
    const temporaryToken = JSON.parse(login.body).accessToken;
    expect(JSON.parse(login.body).user.mustChangePassword).toBe(false);
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/students/me',
      headers: { authorization: `Bearer ${temporaryToken}` },
    });
    expect(allowed.statusCode).toBe(200);
    const temporaryRefreshToken = login.cookies.find(
      (cookie) => cookie.name === 'app_refresh_token',
    )?.value;
    if (!temporaryRefreshToken)
      throw new Error('app_refresh_token cookie not set');
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { origin: 'https://app.jibal-platform.com' },
      cookies: { app_refresh_token: temporaryRefreshToken },
    });
    expect(refresh.statusCode).toBe(201);
    const refreshedToken = JSON.parse(refresh.body).accessToken;
    const change = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${refreshedToken}` },
      payload: { oldPassword: temporaryPassword, newPassword: 'ChangedP@ss1!' },
    });
    expect(change.statusCode).toBe(201);
    const sessionAfterChange = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${refreshedToken}` },
    });
    expect(sessionAfterChange.statusCode).toBe(401);
    const normalLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: student.phone, password: 'ChangedP@ss1!' },
    });
    expect(normalLogin.statusCode).toBe(201);
    expect(JSON.parse(normalLogin.body).user.mustChangePassword).toBe(false);
  });

  it('suspends, protects parent access, reactivates, and soft-deletes a student', async () => {
    const parentLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: student.nationalId,
        parentPhone: student.parentPhone,
      },
    });
    const parentToken = JSON.parse(parentLogin.body).accessToken;
    const selected = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/select-child',
      headers: { authorization: `Bearer ${parentToken}` },
      payload: { studentUserId: studentId },
    });
    expect(selected.statusCode).toBe(201);
    const selectedToken = JSON.parse(selected.body).accessToken;
    const suspend = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/suspend`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(suspend.statusCode).toBe(200);
    const deniedLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: student.phone, password: 'ChangedP@ss1!' },
    });
    expect(deniedLogin.statusCode).toBe(401);
    const staleSelection = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/selected-child',
      headers: { authorization: `Bearer ${selectedToken}` },
    });
    expect(staleSelection.statusCode).toBe(401);
    const parentRelogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/login',
      payload: {
        nationalId: student.nationalId,
        parentPhone: student.parentPhone,
      },
    });
    const refreshedParentToken = JSON.parse(parentRelogin.body).accessToken;
    const children = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/parents/children',
      headers: { authorization: `Bearer ${refreshedParentToken}` },
    });
    expect(JSON.parse(children.body).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: studentId, status: 'SUSPENDED' }),
      ]),
    );
    const select = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/parents/select-child',
      headers: { authorization: `Bearer ${refreshedParentToken}` },
      payload: { studentUserId: studentId },
    });
    expect(select.statusCode).toBe(403);

    const reactivate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reactivate`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(reactivate.statusCode).toBe(200);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/students/${studentId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { deletionReason: 'Support-requested closure' },
    });
    expect(deleted.statusCode).toBe(200);
    const defaultList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/students',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(JSON.parse(defaultList.body).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: studentId })]),
    );
    const deletedList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/students?status=DISABLED',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(JSON.parse(deletedList.body).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: studentId, status: 'DISABLED' }),
      ]),
    );
    const cannotSuspend = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/suspend`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(cannotSuspend.statusCode).toBe(409);
    const cannotReactivate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reactivate`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(cannotReactivate.statusCode).toBe(409);
    const cannotResetPassword = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reset-password`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { password: '01000001010' },
    });
    expect(cannotResetPassword.statusCode).toBe(409);
  });

  it('allows a deleted student to register again, including legacy deleted accounts', async () => {
    const register = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/students/register',
        payload: { ...student, academicGradeId: gradeId, governorateId },
      });
    const fresh = await register();
    expect(fresh.statusCode).toBe(201);
    const freshId = JSON.parse(fresh.body).user.id;
    expect(freshId).not.toBe(studentId);
    expect((await register()).statusCode).toBe(409);
    const prisma = app.get(PrismaService);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: studentId } }))
        .status,
    ).toBe('DISABLED');

    const originalHash = (
      await prisma.studentProfile.findUniqueOrThrow({
        where: { userId: freshId },
      })
    ).nationalIdHash;
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/students/${freshId}`,
      headers: { authorization: `Bearer ${superAdminToken}` },
      payload: { deletionReason: 'Test legacy deletion' },
    });
    expect(deleted.statusCode).toBe(200);
    // Recreate the state of an account deleted before this change.
    await prisma.user.update({
      where: { id: freshId },
      data: { loginIdentifier: student.phone },
    });
    await prisma.studentProfile.update({
      where: { userId: freshId },
      data: { nationalIdHash: originalHash },
    });
    const legacy = await register();
    expect(legacy.statusCode).toBe(201);
    expect(JSON.parse(legacy.body).user.id).not.toBe(freshId);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: freshId } })).status,
    ).toBe('DISABLED');
  });

  it('allows only a super admin to reset an administrator password', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/admins',
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    const targetId = JSON.parse(list.body).data.find(
      (admin: { loginIdentifier: string }) =>
        admin.loginIdentifier === 'student-support@example.com',
    ).id;
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/admins/${targetId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(forbidden.statusCode).toBe(403);
    const reset = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/admins/${targetId}/reset-password`,
      headers: { authorization: `Bearer ${superAdminToken}` },
    });
    expect(reset.statusCode).toBe(201);
    const temporaryPassword = JSON.parse(reset.body).temporaryPassword;
    expect(temporaryPassword).toBeTruthy();
    const revokedSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(revokedSession.statusCode).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'student-support@example.com',
        password: temporaryPassword,
      },
    });
    expect(login.statusCode).toBe(201);
    const forcedToken = JSON.parse(login.body).accessToken;
    expect(JSON.parse(login.body).user.mustChangePassword).toBe(true);
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/students',
      headers: { authorization: `Bearer ${forcedToken}` },
    });
    expect(blocked.statusCode).toBe(403);
    const change = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${forcedToken}` },
      payload: {
        oldPassword: temporaryPassword,
        newPassword: 'AdminChangedP@ss1!',
      },
    });
    expect(change.statusCode).toBe(201);
    const normalLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/admins/login',
      payload: {
        email: 'student-support@example.com',
        password: 'AdminChangedP@ss1!',
      },
    });
    expect(normalLogin.statusCode).toBe(201);
    expect(JSON.parse(normalLogin.body).user.mustChangePassword).toBe(false);
  });
});
