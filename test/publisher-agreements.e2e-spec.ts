import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './utils/create-test-app';
import { cleanDatabase, flushTestRedis, seedSuperAdmin } from './utils/db';
import { PrismaService } from '../src/database/prisma.service';
import { PublisherAgreementsService } from '../src/modules/publisher-agreements/publisher-agreements.service';
import {
  AccountStatus,
  ContentStatus,
  Role,
} from '../src/common/types/roles.enum';

describe('Publisher agreements and pricing (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let service: PublisherAgreementsService;
  let actor: { id: string; role: Role; sessionId: string };
  let ids: {
    courseId: string;
    chapterId: string;
    lessonId: string;
    publisherId: string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    await flushTestRedis(app);
    actor = {
      ...(await seedSuperAdmin(
        app,
        'agreements-admin@example.com',
        'SuperAdminP@ss1!',
      )),
      role: Role.SUPER_ADMIN,
      sessionId: 'test-session',
    };
    prisma = app.get(PrismaService);
    service = app.get(PublisherAgreementsService);
    const publisher = await prisma.user.create({
      data: {
        role: Role.PARTNER,
        status: AccountStatus.ACTIVE,
        loginIdentifier: 'publisher@example.com',
        passwordHash: 'unused',
        partnerProfile: {
          create: {
            partnerType: 'CONTENT_PUBLISHER',
            displayName: 'Publisher',
            createdByAdminId: actor.id,
          },
        },
      },
    });
    const grade = await prisma.academicGrade.create({
      data: {
        titleAr: 'Grade',
        slug: 'grade',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const subject = await prisma.subject.create({
      data: {
        academicGradeId: grade.id,
        title: 'Subject',
        slug: 'subject',
        sortOrder: 1,
        status: ContentStatus.DRAFT,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const course = await prisma.course.create({
      data: {
        subjectId: subject.id,
        title: 'Course',
        slug: 'course',
        sortOrder: 1,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const chapter = await prisma.chapter.create({
      data: {
        courseId: course.id,
        title: 'Chapter',
        slug: 'chapter',
        sortOrder: 1,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    const lesson = await prisma.lesson.create({
      data: {
        chapterId: chapter.id,
        title: 'Lesson',
        slug: 'lesson',
        sortOrder: 1,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    ids = {
      courseId: course.id,
      chapterId: chapter.id,
      lessonId: lesson.id,
      publisherId: publisher.id,
    };
  });
  afterAll(async () => {
    await app.close();
  });

  it('inherits pricing and resolves a lesson agreement', async () => {
    await service.setPricing(
      actor,
      { courseId: ids.courseId },
      { isPurchasable: true, priceMinor: 20_000, currency: 'EGP' },
    );
    expect(
      await service.resolvePricing(actor, { lessonId: ids.lessonId }),
    ).toMatchObject({
      isPurchasable: true,
      priceMinor: 20_000,
      resolvedFrom: { courseId: ids.courseId },
    });
    const agreement = await service.create(actor, {
      lessonId: ids.lessonId,
      publisherUserId: ids.publisherId,
      revenueShareBps: 2_500,
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    await service.activate(actor, agreement.id);
    const resolved = await service.resolve(
      actor,
      { lessonId: ids.lessonId },
      new Date('2026-06-15T00:00:00.000Z'),
    );
    expect(resolved.agreement?.id).toBe(agreement.id);
  });
});
