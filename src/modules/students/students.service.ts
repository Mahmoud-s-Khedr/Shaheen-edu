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
import type { Prisma } from '@prisma/client';

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
            governorateRef: { select: { id: true, nameAr: true, nameEn: true } },
            centerRef: { select: { id: true, nameAr: true, nameEn: true } },
            nationalIdLast4: true,
            academicGradeId: true,
          },
        },
      },
    });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return { ...student, studentProfile: student.studentProfile && { ...student.studentProfile, governorate: this.geographyDto(student.studentProfile.governorateRef), center: this.geographyDto(student.studentProfile.centerRef), governorateRef: undefined, centerRef: undefined } };
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
    const current = await this.prisma.studentProfile.findUniqueOrThrow({ where: { userId }, select: { governorateId: true } });
    const selectedCenter = dto.centerId == null ? null : dto.centerId === undefined ? undefined : await this.prisma.center.findFirst({ where: { id: dto.centerId, governorateId: current.governorateId } });
    if (dto.centerId !== undefined && dto.centerId !== null && !selectedCenter) throw new ConflictException('Center must belong to the student governorate');
    await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        fullName: dto.fullName,
        ...(dto.centerId === undefined ? {} : { centerId: dto.centerId, center: selectedCenter?.nameAr ?? null }),
        academicGradeId: dto.academicGradeId,
      },
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
        ...(query.academicGradeId ? { academicGradeId: query.academicGradeId } : {}),
      },
    };
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { loginIdentifier: { contains: search, mode: 'insensitive' } },
        { studentProfile: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [students, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: this.adminStudentSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
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

  async softDelete(actor: RequestUser, targetId: string, dto: DeleteStudentDto) {
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
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
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

  private geographyDto(record: { id: string; nameAr: string; nameEn: string | null } | null) { return record && { id: record.id, name: { ar: record.nameAr, en: record.nameEn } }; }
}
