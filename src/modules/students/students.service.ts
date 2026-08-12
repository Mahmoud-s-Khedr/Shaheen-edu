import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/services/password.service';
import {
  AccountStatus,
  ContentStatus,
  Role,
} from '../../common/types/roles.enum';
import type { UpdateStudentDto } from './dto/update-student.dto';
import type { QueryAdminStudentsDto } from './dto/query-admin-students.dto';
import type { DeleteStudentDto } from './dto/delete-student.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  arabicMatch,
  paginateArabicSearch,
  resolveSearchQuery,
  sqlAnd,
} from '../../common/search/arabic-search';
import { Prisma } from '@prisma/client';
import {
  isValidEgyptianPhone,
  normalizeEgyptianPhone,
} from '../../common/utils/phone.util';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  /** Ownership is structural: userId always comes from req.user.id, never a param. */
  async getOwnProfile(userId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        loginIdentifier: true,
        createdAt: true,
        studentProfile: {
          select: {
            fullName: true,
            governorate: true,
            center: true,
            governorateRef: {
              select: { id: true, nameAr: true, nameEn: true },
            },
            centerRef: { select: { id: true, nameAr: true, nameEn: true } },
            nationalIdLast4: true,
            academicGradeId: true,
            parentPhoneNormalized: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    const { studentProfile, ...user } = student;
    if (!studentProfile) return { ...user, studentProfile };

    const { parentPhoneNormalized, governorateRef, centerRef, ...profile } =
      studentProfile;
    return {
      ...user,
      studentProfile: {
        ...profile,
        parentPhone: parentPhoneNormalized,
        governorate: this.geographyDto(governorateRef),
        center: this.geographyDto(centerRef),
      },
    };
  }

  async updateOwnProfile(userId: string, dto: UpdateStudentDto) {
    if (dto.academicGradeId !== undefined) {
      const grade = await this.prisma.academicGrade.findFirst({
        where: { id: dto.academicGradeId, status: ContentStatus.PUBLISHED },
      });
      if (!grade) {
        throw new ConflictException('Academic grade must be published');
      }
    }
    const current = await this.prisma.studentProfile.findUniqueOrThrow({
      where: { userId },
      select: { governorateId: true, parentPhoneNormalized: true },
    });
    const governorateChanged =
      dto.governorateId !== undefined &&
      dto.governorateId !== current.governorateId;
    const governorate =
      dto.governorateId === undefined
        ? undefined
        : await this.prisma.governorate.findUnique({
            where: { id: dto.governorateId },
          });
    if (dto.governorateId !== undefined && !governorate) {
      throw new NotFoundException('Governorate not found');
    }
    const targetGovernorateId = dto.governorateId ?? current.governorateId;
    const selectedCenter =
      dto.centerId == null
        ? null
        : dto.centerId === undefined
          ? undefined
          : await this.prisma.center.findFirst({
              where: { id: dto.centerId, governorateId: targetGovernorateId },
            });
    if (
      dto.centerId !== undefined &&
      dto.centerId !== null &&
      !selectedCenter
    ) {
      throw new ConflictException(
        'Center must belong to the student governorate',
      );
    }

    const parentPhoneNormalized =
      dto.parentPhone === undefined
        ? undefined
        : normalizeEgyptianPhone(dto.parentPhone);
    if (
      parentPhoneNormalized !== undefined &&
      !isValidEgyptianPhone(parentPhoneNormalized)
    ) {
      throw new BadRequestException('Invalid parent phone number format');
    }
    const parentPhoneChanged =
      parentPhoneNormalized !== undefined &&
      parentPhoneNormalized !== current.parentPhoneNormalized;
    const centerWasImplicitlyCleared =
      governorateChanged && dto.centerId === undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.studentProfile.update({
        where: { userId },
        data: {
          fullName: dto.fullName,
          parentPhoneNormalized,
          academicGradeId: dto.academicGradeId,
          ...(governorate
            ? { governorateId: governorate.id, governorate: governorate.nameAr }
            : {}),
          ...(dto.centerId === undefined && !centerWasImplicitlyCleared
            ? {}
            : {
                centerId: selectedCenter?.id ?? null,
                center: selectedCenter?.nameAr ?? null,
              }),
        },
      });
      if (parentPhoneChanged) {
        await tx.parentAccessSession.updateMany({
          where: {
            parentPhoneNormalized: current.parentPhoneNormalized,
            revoked: false,
          },
          data: { revoked: true, revokedAt: new Date() },
        });
      }
      await this.auditService.recordWithClient(tx, {
        actorUserId: userId,
        action: 'STUDENT_SELF_UPDATED',
        targetType: 'User',
        targetId: userId,
        metadata: { fields: Object.keys(dto) },
      });
    });
    return this.getOwnProfile(userId);
  }

  async listForAdmin(actor: RequestUser, query: QueryAdminStudentsDto) {
    this.assertAdmin(actor);
    const where: Prisma.UserWhereInput = {
      role: Role.STUDENT,
      status: query.status ?? { not: AccountStatus.DISABLED },
      studentProfile: {
        ...(query.governorateId ? { governorateId: query.governorateId } : {}),
        ...(query.centerId ? { centerId: query.centerId } : {}),
        ...(query.academicGradeId
          ? { academicGradeId: query.academicGradeId }
          : {}),
      },
    };
    const search = resolveSearchQuery(query);
    const { data: students, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.user,
      target: 'user',
      q: search,
      scope: {
        where: sqlAnd(
          Prisma.sql`t.role = ${Role.STUDENT}::"Role"`,
          query.status
            ? Prisma.sql`t.status = ${query.status}::"AccountStatus"`
            : Prisma.sql`t.status <> ${AccountStatus.DISABLED}::"AccountStatus"`,
          query.governorateId
            ? Prisma.sql`sp."governorateId" = ${query.governorateId}`
            : undefined,
          query.centerId
            ? Prisma.sql`sp."centerId" = ${query.centerId}`
            : undefined,
          query.academicGradeId
            ? Prisma.sql`sp."academicGradeId" = ${query.academicGradeId}`
            : undefined,
        ),
        join: Prisma.sql`JOIN "StudentProfile" sp ON sp."userId" = t.id`,
        // The student's name lives on the profile, so a hit there is OR-ed with
        // the login-identifier match on the user row.
        alsoMatches: search
          ? arabicMatch('studentProfile', search, 'sp')
          : undefined,
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where,
      args: { select: this.adminStudentSelect },
      page: query.page,
      limit: query.limit,
    });
    return {
      data: students.map((student) => this.toAdminStudent(student)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async getForAdmin(actor: RequestUser, targetId: string) {
    this.assertAdmin(actor);
    const student = await this.prisma.user.findFirst({
      where: { id: targetId, role: Role.STUDENT },
      select: this.adminStudentSelect,
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.toAdminStudent(student);
  }

  async suspend(actor: RequestUser, targetId: string) {
    this.assertAdmin(actor);
    await this.getActiveOrSuspendedStudent(targetId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.user.updateMany({
        where: {
          id: targetId,
          role: Role.STUDENT,
          status: { in: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED] },
        },
        data: { status: AccountStatus.SUSPENDED },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Student state changed; try again');
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: targetId },
        select: this.adminStudentSelect,
      });
      await tx.authSession.updateMany({
        where: { userId: targetId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
      await tx.parentAccessSession.updateMany({
        where: { activeStudentId: targetId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_SUSPENDED',
        targetType: 'User',
        targetId,
      });
      return user;
    });
    return this.toAdminStudent(updated);
  }

  async reactivate(actor: RequestUser, targetId: string) {
    this.assertAdmin(actor);
    const target = await this.getStudentOrThrow(targetId);
    if (target.status !== AccountStatus.SUSPENDED) {
      throw new ConflictException('Only suspended students can be reactivated');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.user.updateMany({
        where: {
          id: targetId,
          role: Role.STUDENT,
          status: AccountStatus.SUSPENDED,
        },
        data: { status: AccountStatus.ACTIVE },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Student state changed; try again');
      }
      const user = await tx.user.findUniqueOrThrow({
        where: { id: targetId },
        select: this.adminStudentSelect,
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_REACTIVATED',
        targetType: 'User',
        targetId,
      });
      return user;
    });
    return this.toAdminStudent(updated);
  }

  async softDelete(
    actor: RequestUser,
    targetId: string,
    dto: DeleteStudentDto,
  ) {
    this.assertAdmin(actor);
    const target = await this.getStudentOrThrow(targetId);
    if (target.status === AccountStatus.DISABLED) {
      throw new ConflictException('Student is already deleted');
    }
    const deletionReason = dto.deletionReason.trim();
    if (!deletionReason) {
      throw new BadRequestException('Deletion reason is required');
    }
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const transition = await tx.user.updateMany({
        where: {
          id: targetId,
          role: Role.STUDENT,
          status: { in: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED] },
        },
        data: {
          status: AccountStatus.DISABLED,
          deletedAt,
          deletedById: actor.id,
          deletionReason,
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException('Student state changed; try again');
      }
      await tx.authSession.updateMany({
        where: { userId: targetId, revoked: false },
        data: { revoked: true, revokedAt: deletedAt },
      });
      await tx.parentAccessSession.updateMany({
        where: { activeStudentId: targetId, revoked: false },
        data: { revoked: true, revokedAt: deletedAt },
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_SOFT_DELETED',
        targetType: 'User',
        targetId,
        metadata: { deletionReason },
      });
    });
    return { id: targetId, deleted: true };
  }

  async resetPassword(actor: RequestUser, targetId: string) {
    this.assertAdmin(actor);
    const target = await this.getStudentOrThrow(targetId);
    if (target.status !== AccountStatus.ACTIVE) {
      throw new ConflictException('Only active students can be reset');
    }
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const passwordResetAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.user.updateMany({
        where: {
          id: targetId,
          role: Role.STUDENT,
          status: AccountStatus.ACTIVE,
        },
        data: { passwordHash, mustChangePassword: true, passwordResetAt },
      });
      if (reset.count !== 1) {
        throw new ConflictException('Student state changed; try again');
      }
      await tx.authSession.updateMany({
        where: { userId: targetId, revoked: false },
        data: { revoked: true, revokedAt: passwordResetAt },
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_PASSWORD_RESET',
        targetType: 'User',
        targetId,
      });
    });
    return { temporaryPassword, passwordResetAt };
  }

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getStudentOrThrow(targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target || target.role !== Role.STUDENT) {
      throw new NotFoundException('Student not found');
    }
    return target;
  }

  private async getActiveOrSuspendedStudent(targetId: string) {
    const target = await this.getStudentOrThrow(targetId);
    if (target.status === AccountStatus.DISABLED) {
      throw new ConflictException('Deleted students cannot be suspended');
    }
    return target;
  }

  private generateTemporaryPassword() {
    return randomBytes(24).toString('base64url');
  }

  private readonly adminStudentSelect = {
    id: true,
    status: true,
    loginIdentifier: true,
    createdAt: true,
    lastLoginAt: true,
    deletedAt: true,
    studentProfile: {
      select: {
        fullName: true,
        nationalIdLast4: true,
        academicGradeId: true,
        academicGrade: { select: { titleAr: true, titleEn: true } },
        governorateRef: { select: { id: true, nameAr: true, nameEn: true } },
        centerRef: { select: { id: true, nameAr: true, nameEn: true } },
      },
    },
  } satisfies Prisma.UserSelect;

  private toAdminStudent(student: any) {
    const profile = student.studentProfile;
    return {
      id: student.id,
      fullName: profile.fullName,
      phone: student.loginIdentifier,
      status: student.status,
      nationalIdLast4: profile.nationalIdLast4,
      academicGradeId: profile.academicGradeId,
      academicGrade: profile.academicGrade && {
        ar: profile.academicGrade.titleAr,
        en: profile.academicGrade.titleEn,
      },
      governorate: this.geographyDto(profile.governorateRef),
      center: this.geographyDto(profile.centerRef),
      createdAt: student.createdAt,
      lastLoginAt: student.lastLoginAt,
      deletedAt: student.deletedAt,
    };
  }

  private geographyDto(
    record: { id: string; nameAr: string; nameEn: string | null } | null,
  ) {
    return (
      record && {
        id: record.id,
        name: { ar: record.nameAr, en: record.nameEn },
      }
    );
  }
}
