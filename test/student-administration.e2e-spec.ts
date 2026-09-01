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
      headers: { authorization: `Bearer ${adminToken}` },
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

  it('resets a student password and forces a password change', async () => {
    const reset = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(reset.statusCode).toBe(200);
    const temporaryPassword = JSON.parse(reset.body).temporaryPassword;
    expect(temporaryPassword).toBeTruthy();
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
    const forcedToken = JSON.parse(login.body).accessToken;
    expect(JSON.parse(login.body).user.mustChangePassword).toBe(true);
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/v1/students/me',
      headers: { authorization: `Bearer ${forcedToken}` },
    });
    expect(blocked.statusCode).toBe(403);
    const forcedRefreshToken = login.cookies.find(
      (cookie) => cookie.name === 'refresh_token',
    )?.value;
    if (!forcedRefreshToken) throw new Error('refresh_token cookie not set');
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: forcedRefreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    const change = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { authorization: `Bearer ${forcedToken}` },
      payload: { oldPassword: temporaryPassword, newPassword: 'ChangedP@ss1!' },
    });
    expect(change.statusCode).toBe(201);
    const forcedSessionAfterChange = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${forcedToken}` },
    });
    expect(forcedSessionAfterChange.statusCode).toBe(401);
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
      headers: { authorization: `Bearer ${adminToken}` },
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
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(reactivate.statusCode).toBe(200);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/students/${studentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { deletionReason: 'Support-requested closure' },
    });
    expect(deleted.statusCode).toBe(200);
    const defaultList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/students',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(defaultList.body).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: studentId })]),
    );
    const deletedList = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/students?status=DISABLED',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(JSON.parse(deletedList.body).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: studentId, status: 'DISABLED' }),
      ]),
    );
    const cannotSuspend = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cannotSuspend.statusCode).toBe(409);
    const cannotReactivate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reactivate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cannotReactivate.statusCode).toBe(409);
    const cannotResetPassword = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/students/${studentId}/reset-password`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(cannotResetPassword.statusCode).toBe(409);
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
