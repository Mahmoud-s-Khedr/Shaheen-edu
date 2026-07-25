import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { NationalIdService } from './national-id.service';
import {
  AuthRateLimitService,
  type LoginRateLimitPurpose,
} from './auth-rate-limit.service';
import {
  AccountStatus,
  ContentStatus,
  Role,
} from '../../../common/types/roles.enum';
import {
  isValidEgyptianPhone,
  normalizeEgyptianPhone,
} from '../../../common/utils/phone.util';
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
    purpose: LoginRateLimitPurpose;
  }): Promise<LoginResult> {
    const hashedIdentifier = AuthRateLimitService.hashIdentifier(
      params.loginIdentifier,
    );
    await this.rateLimitService.assertLoginAllowed(
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
      await this.rateLimitService.recordLoginFailure(
        params.purpose,
        hashedIdentifier,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await this.passwordService.verify(
      user.passwordHash,
      params.password,
    );
    if (!passwordOk) {
      await this.rateLimitService.recordLoginFailure(
        params.purpose,
        hashedIdentifier,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.rateLimitService.clearLoginFailures(
      params.purpose,
      hashedIdentifier,
    );

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

    if (
      !isValidEgyptianPhone(normalizedPhone) ||
      !isValidEgyptianPhone(normalizedParentPhone)
    ) {
      throw new BadRequestException('Invalid phone number format');
    }

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

    {
      const academicGrade = await this.prisma.academicGrade.findFirst({
        where: {
          id: dto.academicGradeId,
          status: ContentStatus.PUBLISHED,
        },
      });
      if (!academicGrade) {
        throw new NotFoundException('Academic grade not found');
      }
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
      const governorate = await tx.governorate.upsert({
        where: { name: dto.governorate.trim() },
        create: { name: dto.governorate.trim() },
        update: {},
      });
      const center = dto.center?.trim()
        ? await tx.center.upsert({
            where: { governorateId_name: { governorateId: governorate.id, name: dto.center.trim() } },
            create: { governorateId: governorate.id, name: dto.center.trim() },
            update: {},
          })
        : null;
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          fullName: dto.fullName,
          nationalIdHash,
          nationalIdEncrypted,
          nationalIdLast4,
          academicGradeId: dto.academicGradeId,
          governorate: dto.governorate,
          center: dto.center,
          governorateId: governorate.id,
          centerId: center?.id,
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
