import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { ConfigModule } from './config/config.module';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config/configuration';
import { LoggerModule } from './common/logging/logger.module';
import { DatabaseModule } from './database/database.module';
import { SearchModule } from './common/search/search.module';
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
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { PartnerAnalyticsModule } from './modules/partner-analytics/partner-analytics.module';
import { QuestionImportModule } from './modules/ai-question-import/question-import.module';
import { QuestionAiExplanationsModule } from './modules/ai-question-explanations/question-ai-explanations.module';
import { StudentWorkspaceModule } from './modules/student-workspace/student-workspace.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { PartnerFinanceModule } from './modules/partner-finance/partner-finance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { UserAuthGuard } from './common/guards/user-auth.guard';
import type { IncomingMessage } from 'http';
import { normalizeCorrelationId } from './common/logging/correlation-id';

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
          normalizeCorrelationId(req.headers['x-correlation-id']),
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const rateLimit = configService.get('rateLimit', { infer: true });
        return {
          throttlers: [
            {
              ttl: rateLimit.global.windowSeconds * 1000,
              limit: rateLimit.global.limit,
            },
          ],
        };
      },
    }),
    DatabaseModule,
    SearchModule,
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
    AssessmentsModule,
    LeaderboardModule,
    PerformanceModule,
    PartnerAnalyticsModule,
    ReferralsModule,
    PartnerFinanceModule,
    ReportsModule,
    QuestionImportModule,
    QuestionAiExplanationsModule,
    StudentWorkspaceModule,
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
