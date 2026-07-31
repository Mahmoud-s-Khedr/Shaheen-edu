import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './common/logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdminsModule } from './modules/admins/admins.module';
import { PartnersModule } from './modules/partners/partners.module';
import { StudentsModule } from './modules/students/students.module';
import { ParentsModule } from './modules/parents/parents.module';
import { AuditModule } from './modules/audit/audit.module';
import { AcademicGradesModule } from './modules/academic-grades/academic-grades.module';
import { SubjectsModule } from './modules/subjects/subjects.module';
import { CoursesModule } from './modules/courses/courses.module';
import { ChaptersModule } from './modules/chapters/chapters.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { SectionsModule } from './modules/sections/sections.module';
import { ContentItemsModule } from './modules/content-items/content-items.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { AssetsModule } from './modules/assets/assets.module';
import { VideosModule } from './modules/videos/videos.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { PublisherAgreementsModule } from './modules/publisher-agreements/publisher-agreements.module';
import { QuestionBanksModule } from './modules/question-banks/question-banks.module';
import { GeographyModule } from './modules/geography/geography.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { LearningModule } from './modules/learning/learning.module';
import { UserAuthGuard } from './common/guards/user-auth.guard';
import type { IncomingMessage } from 'http';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: IncomingMessage) =>
          (req.headers['x-correlation-id'] as string | undefined) ??
          randomUUID(),
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 30 }],
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AdminsModule,
    PartnersModule,
    StudentsModule,
    ParentsModule,
    AuditModule,
    AcademicGradesModule,
    SubjectsModule,
    CoursesModule,
    ChaptersModule,
    LessonsModule,
    SectionsModule,
    ContentItemsModule,
    EntitlementsModule,
    AssetsModule,
    VideosModule,
    CatalogModule,
    PublisherAgreementsModule,
    QuestionBanksModule,
    GeographyModule,
    CommerceModule,
    LearningModule,
  ],
  providers: [
    // Global deny-by-default auth guard - @Public() opts a route out.
    { provide: APP_GUARD, useClass: UserAuthGuard },
    // Generic per-route in-memory rate limiting (separate from the
    // Redis-backed AuthRateLimitService used for login lockout/backoff).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
