import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { NationalIdService } from './national-id.service';
import {
  AuthRateLimitService,
  type RateLimitPurpose,
} from './auth-rate-limit.service';
import { AccountStatus, Role } from '../../../common/types/roles.enum';
import { normalizeEgyptianPhone } from '../../../common/utils/phone.util';
import type { RegisterStudentDto } from '../dto/register-student.dto';
import type { User } from '@prisma/client';

export interface UserSummary {
  id: string;
  role: Role;
  loginIdentifier: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
}

function toSummary(user: User): UserSummary {
  return {
    id: user.id,
    role: user.role,
    loginIdentifier: user.loginIdentifier,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly nationalIdService: NationalIdService,
    private readonly rateLimitService: AuthRateLimitService,
  ) {}

  /**
   * Shared login path reused by student/admin/partner login controllers.
   * Never reveals whether the failure was "unknown identifier", "wrong
   * role", "wrong password" or "suspended account" - always a generic 401.
   */
  async loginWithPassword(params: {
    loginIdentifier: string;
    password: string;
    allowedRoles: Role[];
    ip?: string;
    userAgent?: string;
    purpose: RateLimitPurpose;
  }): Promise<LoginResult> {
    const hashedIdentifier = AuthRateLimitService.hashIdentifier(
      params.loginIdentifier,
    );
    await this.rateLimitService.assertNotLimited(
      params.purpose,
      hashedIdentifier,
      params.ip,
    );

    const user = await this.prisma.user.findUnique({
      where: { loginIdentifier: params.loginIdentifier },
    });

    if (
      !user ||
      !params.allowedRoles.includes(user.role) ||
      user.status !== AccountStatus.ACTIVE
    ) {
      // Still run a dummy verify to keep timing roughly consistent whether
      // or not the user/role/status check failed.
      await this.passwordService
        .verify(
          '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          params.password,
        )
        .catch(() => false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await this.passwordService.verify(
      user.passwordHash,
      params.password,
    );
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.passwordService.needsRehash(user.passwordHash)) {
      const rehashed = await this.passwordService.hash(params.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: rehashed },
      });
    }

    const { accessToken, refreshToken } =
      await this.sessionService.createSession({
        userId: user.id,
        role: user.role,
        ipAddress: params.ip,
        userAgent: params.userAgent,
      });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken, refreshToken, user: toSummary(user) };
  }

  async registerStudent(
    dto: RegisterStudentDto,
    ip?: string,
    userAgent?: string,
  ): Promise<LoginResult> {
    const normalizedPhone = normalizeEgyptianPhone(dto.phone);
    const normalizedParentPhone = normalizeEgyptianPhone(dto.parentPhone);
    const normalizedNationalId = this.nationalIdService.normalize(
      dto.nationalId,
    );

    if (!this.nationalIdService.validateFormat(normalizedNationalId)) {
      throw new ConflictException('Invalid national ID format');
    }

    const nationalIdHash = this.nationalIdService.hash(normalizedNationalId);

    const existingByPhone = await this.prisma.user.findUnique({
      where: { loginIdentifier: normalizedPhone },
    });
    if (existingByPhone) {
      throw new ConflictException('Phone number already registered');
    }

    const existingByNationalId = await this.prisma.studentProfile.findUnique({
      where: { nationalIdHash },
    });
    if (existingByNationalId) {
      throw new ConflictException('National ID already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const nationalIdEncrypted =
      this.nationalIdService.encrypt(normalizedNationalId);
    const nationalIdLast4 = this.nationalIdService.last4(normalizedNationalId);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          role: Role.STUDENT,
          status: AccountStatus.ACTIVE,
          loginIdentifier: normalizedPhone,
          passwordHash,
        },
      });
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          fullName: dto.fullName,
          nationalIdHash,
          nationalIdEncrypted,
          nationalIdLast4,
          governorate: dto.governorate,
          center: dto.center,
          parentPhoneNormalized: normalizedParentPhone,
        },
      });
      return created;
    });

    const { accessToken, refreshToken } =
      await this.sessionService.createSession({
        userId: user.id,
        role: user.role,
        ipAddress: ip,
        userAgent,
      });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { accessToken, refreshToken, user: toSummary(user) };
  }
}
