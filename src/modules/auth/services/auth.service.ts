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
import { Prisma } from '@prisma/client';

export interface UserSummary {
  id: string;
  role: Role;
  loginIdentifier: string;
  mustChangePassword: boolean;
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
    mustChangePassword: user.mustChangePassword,
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

    const governorate = await this.prisma.governorate.findUnique({
      where: { id: dto.governorateId },
    });
    if (!governorate) throw new NotFoundException('Governorate not found');
    const center = dto.centerId
      ? await this.prisma.center.findFirst({
          where: { id: dto.centerId, governorateId: governorate.id },
        })
      : null;
    if (dto.centerId && !center)
      throw new BadRequestException(
        'Center must belong to the selected governorate',
      );

    const passwordHash = await this.passwordService.hash(dto.password);
    const nationalIdEncrypted =
      this.nationalIdService.encrypt(normalizedNationalId);
    const nationalIdLast4 = this.nationalIdService.last4(normalizedNationalId);

    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Release identifiers held by students deleted before identifier release
        // was introduced. The conditional updates never affect live accounts.
        const phoneOwner = await tx.user.findUnique({
          where: { loginIdentifier: normalizedPhone },
        });
        if (phoneOwner) {
          if (
            phoneOwner.role !== Role.STUDENT ||
            phoneOwner.status !== AccountStatus.DISABLED ||
            !phoneOwner.deletedAt
          ) {
            throw new ConflictException('Phone number already registered');
          }
          await tx.user.updateMany({
            where: {
              id: phoneOwner.id,
              role: Role.STUDENT,
              status: AccountStatus.DISABLED,
              deletedAt: { not: null },
              loginIdentifier: normalizedPhone,
            },
            data: { loginIdentifier: `deleted-student:${phoneOwner.id}` },
          });
        }
        const idOwner = await tx.studentProfile.findUnique({
          where: { nationalIdHash },
          include: { user: true },
        });
        if (idOwner) {
          if (
            idOwner.user.role !== Role.STUDENT ||
            idOwner.user.status !== AccountStatus.DISABLED ||
            !idOwner.user.deletedAt
          ) {
            throw new ConflictException('National ID already registered');
          }
          await tx.studentProfile.updateMany({
            where: {
              userId: idOwner.userId,
              nationalIdHash,
              user: {
                role: Role.STUDENT,
                status: AccountStatus.DISABLED,
                deletedAt: { not: null },
              },
            },
            data: { nationalIdHash: `deleted-student:${idOwner.userId}` },
          });
        }
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
            academicGradeId: dto.academicGradeId,
            governorate: governorate.nameAr,
            center: center?.nameAr,
            governorateId: governorate.id,
            centerId: center?.id,
            parentPhoneNormalized: normalizedParentPhone,
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const fields = Array.isArray(error.meta?.target)
          ? error.meta.target
          : [];
        if (fields.includes('loginIdentifier'))
          throw new ConflictException('Phone number already registered');
        if (fields.includes('nationalIdHash'))
          throw new ConflictException('National ID already registered');
      }
      throw error;
    }

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
