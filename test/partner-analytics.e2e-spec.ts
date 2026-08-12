/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- e2e tests parse raw JSON bodies. */
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import argon2 from 'argon2';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import {
  AccountStatus,
  ContentStatus,
  OrderStatus,
  PartnerType,
  PublisherAgreementStatus,
  Role,
} from '../src/common/types/roles.enum';

describe('Content publisher partner analytics (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let publisherToken: string;
  let secondPublisherToken: string;
  let referralToken: string;
  let publisherId: string;
  let courseId: string;
  const json = (response: { body: string }) => JSON.parse(response.body);
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    const admin = await seedSuperAdmin(
      app,
      'partner-analytics-admin@example.com',
      'SuperAdminP@ss1!',
    );
    prisma = app.get(PrismaService);

    const createPartner = async (email: string, type: PartnerType) => {
      const password = 'PartnerP@ss1!';
      const user = await prisma.user.create({
        data: {
          role: Role.PARTNER,
          status: AccountStatus.ACTIVE,
          loginIdentifier: email,
          passwordHash: await argon2.hash(password),
          partnerProfile: {
            create: {
              partnerType: type,
              displayName: email,
              createdByAdminId: admin.id,
            },
          },
        },
      });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/partners/login',
        payload: { email, password },
      });
      return { id: user.id, token: json(login).accessToken as string };
    };
    const publisher = await createPartner(
      'publisher-analytics@example.com',
      PartnerType.CONTENT_PUBLISHER,
    );
    publisherId = publisher.id;
    publisherToken = publisher.token;
    secondPublisherToken = (
      await createPartner(
        'other-publisher-analytics@example.com',
        PartnerType.CONTENT_PUBLISHER,
      )
    ).token;
    referralToken = (
      await createPartner(
        'referral-analytics@example.com',
        PartnerType.REFERRAL_PARTNER,
      )
    ).token;

    const grade = await prisma.academicGrade.create({
      data: {
        titleAr: 'Analytics grade',
        slug: 'analytics-grade',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const subject = await prisma.subject.create({
      data: {
        academicGradeId: grade.id,
        title: 'Analytics subject',
        slug: 'analytics-subject',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    const course = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Publisher course',
        slug: 'publisher-course',
        sortOrder: 1,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    courseId = course.id;
    const agreement = await prisma.publisherAgreement.create({
      data: {
        publisherUserId: publisherId,
        courseId,
        revenueShareBps: 2_500,
        startsAt: new Date('2026-08-01T00:00:00.000Z'),
        status: PublisherAgreementStatus.ACTIVE,
        createdById: admin.id,
      },
    });
    const student = await prisma.user.create({
      data: {
        role: Role.STUDENT,
        status: AccountStatus.ACTIVE,
        loginIdentifier: 'analytics-student@example.com',
        passwordHash: 'unused',
        studentProfile: {
          create: {
            fullName: 'Private Student',
            nationalIdHash: 'analytics-national-id',
            nationalIdLast4: '1234',
            governorate: 'Cairo',
            governorateId: (
              await prisma.governorate.create({ data: { nameAr: 'Cairo' } })
            ).id,
            parentPhoneNormalized: '01000000000',
          },
        },
      },
    });
    const method = await prisma.manualPaymentMethod.create({
      data: {
        titleAr: 'Cash',
        instructionsAr: 'Pay',
        sortOrder: 1,
        createdById: admin.id,
      },
    });
    await prisma.order.create({
      data: {
        studentUserId: student.id,
        manualPaymentMethodId: method.id,
        paymentMethodSnapshot: {},
        totalMinor: 10_000,
        currency: 'EGP',
        status: OrderStatus.APPROVED,
        approvedAt: new Date('2026-08-15T10:00:00.000Z'),
        items: {
          create: {
            targetType: 'COURSE',
            courseId,
            titleSnapshot: 'Publisher course',
            priceMinor: 10_000,
            currency: 'EGP',
          },
        },
      },
    });
    await prisma.publisherEarningsStatement.create({
      data: {
        agreementId: agreement.id,
        courseId,
        periodStartsAt: new Date('2026-08-01T00:00:00.000Z'),
        periodEndsAt: new Date('2026-08-31T20:59:59.999Z'),
        grossRevenueMinor: 8_000,
        currency: 'EGP',
        revenueShareBps: 2_500,
        publisherEarningsMinor: 2_000,
        createdById: admin.id,
      },
    });
  });

  afterAll(async () => app.close());

  it('returns own realized and estimated dashboard metrics without learner identity', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/partners/dashboard?from=2026-08-01&to=2026-08-31',
      headers: bearer(publisherToken),
    });
    expect(response.statusCode).toBe(200);
    const body = json(response);
    expect(body.kpis).toMatchObject({
      realizedGrossRevenue: { amountMinor: 8_000, currency: 'EGP' },
      realizedEarnings: { amountMinor: 2_000, currency: 'EGP' },
      estimated: {
        grossRevenue: { amountMinor: 10_000 },
        earnings: { amountMinor: 2_500 },
        approvedOrders: 1,
        customers: 1,
      },
      activeAgreements: 1,
      coveredContent: 1,
    });
    expect(JSON.stringify(body)).not.toContain('Private Student');
    expect(body.latestStatements[0]).toMatchObject({
      grossRevenue: { amountMinor: 8_000 },
      earnings: { amountMinor: 2_000 },
    });
  });

  it('scopes content and statements to the authenticated publisher and rejects referral partners', async () => {
    const own = await app.inject({
      method: 'GET',
      url: '/api/v1/partners/analytics/content',
      headers: bearer(publisherToken),
    });
    expect(own.statusCode).toBe(200);
    expect(json(own).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: expect.objectContaining({
            id: courseId,
            title: 'Publisher course',
          }),
        }),
      ]),
    );
    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/partners/earnings-statements',
      headers: bearer(secondPublisherToken),
    });
    expect(other.statusCode).toBe(200);
    expect(json(other).data).toHaveLength(0);
    const referral = await app.inject({
      method: 'GET',
      url: '/api/v1/partners/dashboard',
      headers: bearer(referralToken),
    });
    expect(referral.statusCode).toBe(403);
  });
});
