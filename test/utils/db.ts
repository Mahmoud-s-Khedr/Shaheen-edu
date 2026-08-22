import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as argon2 from 'argon2';
import { PrismaService } from '../../src/database/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import {
  Role,
  AccountStatus,
  ContentStatus,
} from '../../src/common/types/roles.enum';

/** Deletes all app-owned rows, in FK-safe order. Run at the start of each e2e suite. */
export async function cleanDatabase(
  app: NestFastifyApplication,
): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.adminAuditLog.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.parentAccessSession.deleteMany();
  await prisma.contentPlacement.deleteMany();
  await prisma.contentItem.deleteMany();
  // Snapshots hold restrictive FKs to StudentProfile and StudentEntitlement, so
  // they must go before both.
  await prisma.archivedAccessSnapshot.deleteMany();
  // Entitlements hold restrictive FKs to Course, Chapter, and OrderItem, so they
  // must go before the hierarchy rows below and before the commerce rows.
  await prisma.studentEntitlement.deleteMany();
  await prisma.paymentReceipt.deleteMany();
  await prisma.paymobWebhookEvent.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.couponReservation.deleteMany();
  await prisma.couponTarget.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.discountCampaignTarget.deleteMany();
  await prisma.discountCampaign.deleteMany();
  // Commerce rows hold restrictive FKs to Course/Chapter (cart and order items),
  // Asset (payment proofs), StudentProfile (orders), and User (payment methods),
  // so the whole chain must go before all four.
  await prisma.manualPaymentSubmission.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.commerceIdempotencyKey.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.manualPaymentMethod.deleteMany();
  await prisma.publisherEarningsStatement.deleteMany();
  await prisma.publisherAgreement.deleteMany();
  // Assessment cascades to its scopes/snapshot/attempts, but AssessmentScope
  // holds restrictive FKs to Course/Chapter/Lesson/Section, so it must go
  // before the hierarchy rows below. StudentQuestionAttempt and Question hold
  // restrictive FKs to Question/Course respectively, so they must go before
  // Question and Course/QuestionBank/QuestionSource in turn.
  await prisma.assessment.deleteMany();
  await prisma.studentQuestionAttempt.deleteMany();
  await prisma.question.deleteMany();
  await prisma.questionBank.deleteMany();
  await prisma.questionSource.deleteMany();
  await prisma.section.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.course.deleteMany();
  await prisma.subject.deleteMany();
  // Must run before academicGrade.deleteMany() due to the FK.
  await prisma.studentProfile.deleteMany();
  await prisma.academicGrade.deleteMany();
  // StudentProfile holds restrictive FKs to both, and Center to Governorate.
  await prisma.center.deleteMany();
  await prisma.governorate.deleteMany();
  // Assets and their references are gated behind restrictive FKs (uploadedById ->
  // User, coverAssetId/primaryAssetId -> Asset), so they must be cleared after the
  // hierarchy/content rows above and before User below.
  await prisma.assetReference.deleteMany();
  await prisma.videoAsset.deleteMany();
  await prisma.bunnyStreamWebhookEvent.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.partnerProfile.deleteMany();
  await prisma.user.deleteMany();
}

export async function flushTestRedis(
  app: NestFastifyApplication,
): Promise<void> {
  const redis = app.get(RedisService);
  await redis.client.flushdb();
}

export async function seedSuperAdmin(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ id: string; loginIdentifier: string }> {
  const prisma = app.get(PrismaService);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      role: Role.SUPER_ADMIN,
      status: AccountStatus.ACTIVE,
      loginIdentifier: email.toLowerCase(),
      passwordHash,
    },
  });
  return { id: user.id, loginIdentifier: user.loginIdentifier };
}

export async function seedPublishedAcademicGrade(
  app: NestFastifyApplication,
  slug: string,
): Promise<{ id: string }> {
  return seedAcademicGrade(app, slug, ContentStatus.PUBLISHED);
}

export async function seedDraftAcademicGrade(
  app: NestFastifyApplication,
  slug: string,
): Promise<{ id: string }> {
  return seedAcademicGrade(app, slug, ContentStatus.DRAFT);
}

export async function seedGovernorate(
  app: NestFastifyApplication,
  nameEn: string,
): Promise<{ id: string }> {
  return app.get(PrismaService).governorate.create({
    data: { nameAr: nameEn, nameEn },
    select: { id: true },
  });
}

async function seedAcademicGrade(
  app: NestFastifyApplication,
  slug: string,
  status: ContentStatus,
): Promise<{ id: string }> {
  const owner = await seedSuperAdmin(
    app,
    `${slug}-owner@example.com`,
    'SuperAdminP@ss1!',
  );
  const prisma = app.get(PrismaService);
  const sortOrder = (await prisma.academicGrade.count()) + 1;
  return prisma.academicGrade.create({
    data: {
      titleAr: slug,
      slug,
      sortOrder,
      status,
      publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
      createdById: owner.id,
      updatedById: owner.id,
    },
    select: { id: true },
  });
}
