/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON response bodies */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import {
  cleanDatabase,
  flushTestRedis,
  seedGovernorate,
  seedDraftAcademicGrade,
  seedPublishedAcademicGrade,
} from './utils/db';
import { PrismaService } from '../src/database/prisma.service';

const baseRegisterPayload = {
  fullName: 'Student E2E',
  nationalId: '29902020212345',
  phone: '01099998888',
  parentPhone: '01088887777',
  password: 'StudentP@ss1!',
};

describe('Student (e2e)', () => {
  let app: NestFastifyApplication;
  let academicGradeId: string;
  let governorateId: string;

  const registrationPayload = () => ({
    ...baseRegisterPayload,
    governorateId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    academicGradeId = (
      await seedPublishedAcademicGrade(app, 'student-e2e-grade')
    ).id;
    governorateId = (await seedGovernorate(app, 'Cairo')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers successfully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: { ...registrationPayload(), academicGradeId },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.accessToken).toBeDefined();
    expect(body.user.role).toBe('STUDENT');
    // National ID must never appear in any response body.
    expect(response.body).not.toContain('29902020212345');
  });

  it('stores the required academic grade during registration', async () => {
    const prisma = app.get(PrismaService);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        nationalId: '29902020211111',
        phone: '01077776666',
        parentPhone: '01066665555',
        academicGradeId,
      },
    });

    expect(response.statusCode).toBe(201);
    const { user } = JSON.parse(response.body);
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
    });
    expect(studentProfile?.academicGradeId).toBe(academicGradeId);
  });

  it('requires a published academic grade during registration', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        nationalId: '29902020255555',
        phone: '01055556666',
        parentPhone: '01066667777',
      },
    });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        nationalId: '29902020266666',
        phone: '01066667777',
        parentPhone: '01077778888',
        academicGradeId: 'missing-grade-id',
      },
    });
    expect(invalid.statusCode).toBe(404);

    const draftGradeId = (
      await seedDraftAcademicGrade(app, 'student-e2e-draft-grade')
    ).id;
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        nationalId: '29902020277777',
        phone: '01077778888',
        parentPhone: '01088889999',
        academicGradeId: draftGradeId,
      },
    });
    expect(draft.statusCode).toBe(404);
  });

  it('accepts a country-code-form phone and persists the canonical identifier', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        nationalId: '29902020222222',
        academicGradeId,
        phone: '+20 10 1111 2222',
        parentPhone: '00201033334444',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).user.loginIdentifier).toBe('01011112222');
  });

  it('rejects malformed student and parent phone numbers during registration', async () => {
    const malformedStudent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        academicGradeId,
        nationalId: '29902020233333',
        phone: '01312345678',
      },
    });
    expect(malformedStudent.statusCode).toBe(400);

    const malformedParent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        academicGradeId,
        nationalId: '29902020244444',
        phone: '01044445555',
        parentPhone: 'not-a-phone',
      },
    });
    expect(malformedParent.statusCode).toBe(400);
  });

  it('rejects a duplicate phone number', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/register',
      payload: {
        ...registrationPayload(),
        academicGradeId,
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
        ...registrationPayload(),
        academicGradeId,
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

  it('rejects malformed student login phone numbers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/students/login',
      payload: { phone: '01312345678', password: baseRegisterPayload.password },
    });
    expect(response.statusCode).toBe(400);
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
