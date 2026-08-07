import { Module } from '@nestjs/common';
import { StudentAuthController } from './controllers/student-auth.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { PartnerAuthController } from './controllers/partner-auth.controller';
import { ParentAuthController } from './controllers/parent-auth.controller';
import { SharedAuthController } from './controllers/shared-auth.controller';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { NationalIdService } from './services/national-id.service';
import { ParentSessionService } from './services/parent-session.service';
import { AuthRateLimitService } from './services/auth-rate-limit.service';
import { AuthService } from './services/auth.service';
import { ParentAuthGuard } from '../../common/guards/parent-auth.guard';
import { ParentSelectedChildGuard } from '../../common/guards/parent-selected-child.guard';

@Module({
  controllers: [
    StudentAuthController,
    AdminAuthController,
    PartnerAuthController,
    ParentAuthController,
    SharedAuthController,
  ],
  providers: [
    PasswordService,
    TokenService,
    SessionService,
    NationalIdService,
    ParentSessionService,
    AuthRateLimitService,
    AuthService,
    ParentAuthGuard,
    ParentSelectedChildGuard,
  ],
  exports: [
    PasswordService,
    TokenService,
    SessionService,
    NationalIdService,
    AuthRateLimitService,
    AuthService,
  ],
})
export class AuthModule {}
