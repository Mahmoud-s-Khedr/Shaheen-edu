import { accountScope } from '../../common/authorization/course-scope';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { paginateArabicSearch } from '../../common/search/arabic-search';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { SessionService } from '../auth/services/session.service';
import { AuditService } from '../audit/audit.service';
import { Role, AccountStatus } from '../../common/types/roles.enum';
import type { CreateAdminDto } from './dto/create-admin.dto';
import type { UpdateAdminDto } from './dto/update-admin.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  toPaginationMeta,
  type SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';

/**
 * Every mutating method re-checks actor.role===SUPER_ADMIN even though
 * SuperAdminGuard already gates the route (defense-in-depth), AND blocks
 * any mutation targeting a user with role===SUPER_ADMIN - including when
 * the actor IS that same super admin. Self password changes must go
 * through /auth/change-password.
 */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {}

  private assertActorIsSuperAdmin(actor: RequestUser): void {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
  }

  private async getMutableTargetOrThrow(targetId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target) {
      throw new NotFoundException('Admin not found');
    }
    if (target.role === Role.SUPER_ADMIN) {
      // Blocked even when the actor IS this same super admin - self
      // mutation via /admin/admins/:id/* is not allowed, per spec.
      throw new ForbiddenException(
        'The super admin account cannot be targeted by this endpoint',
      );
    }
    if (target.role !== Role.ADMIN && target.role !== Role.TEACHER) {
      throw new NotFoundException('Admin not found');
    }
    return target;
  }

  async create(actor: RequestUser, dto: CreateAdminDto) {
    this.assertActorIsSuperAdmin(actor);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { loginIdentifier: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    if (dto.role !== Role.TEACHER && dto.courseIds?.length)
      throw new BadRequestException('Only teachers accept course assignments');
    await this.validateCourses(dto.courseIds ?? []);
    const passwordHash = await this.passwordService.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        role: dto.role ?? Role.ADMIN,
        teacherCourses:
          dto.role === Role.TEACHER
            ? {
                create: (dto.courseIds ?? []).map((courseId) => ({ courseId })),
              }
            : undefined,
        status: AccountStatus.ACTIVE,
        loginIdentifier: normalizedEmail,
        passwordHash,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'ADMIN_CREATED',
      targetType: 'User',
      targetId: created.id,
      metadata: {
        email: normalizedEmail,
        ...(dto.role === Role.TEACHER
          ? { courseIds: dto.courseIds ?? [] }
          : {}),
      },
    });

    return this.toSummary(created);
  }

  async list(actor: RequestUser, pagination: SearchPaginationQueryDto) {
    this.assertActorIsSuperAdmin(actor);
    const where = { role: { in: [Role.ADMIN, Role.TEACHER] } };
    const { data: admins, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.user,
      target: 'user',
      q: pagination.q,
      scope: { where: Prisma.sql`t.role IN ('ADMIN', 'TEACHER')` },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where,
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      data: await Promise.all(admins.map((admin) => this.toSummary(admin))),
      meta: toPaginationMeta(pagination.page, pagination.limit, total),
    };
  }

  async getById(actor: RequestUser, targetId: string) {
    this.assertActorIsSuperAdmin(actor);
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (
      !target ||
      (target.role !== Role.ADMIN && target.role !== Role.TEACHER)
    ) {
      throw new NotFoundException('Admin not found');
    }
    return this.toSummary(target);
  }

  async update(actor: RequestUser, targetId: string, dto: UpdateAdminDto) {
    this.assertActorIsSuperAdmin(actor);
    await this.getMutableTargetOrThrow(targetId);

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { loginIdentifier: normalizedEmail },
    });
    if (existing && existing.id !== targetId) {
      throw new ConflictException('Email already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { loginIdentifier: normalizedEmail },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'ADMIN_UPDATED',
      targetType: 'User',
      targetId,
      metadata: { email: normalizedEmail },
    });

    return this.toSummary(updated);
  }

  async suspend(actor: RequestUser, targetId: string) {
    this.assertActorIsSuperAdmin(actor);
    await this.getMutableTargetOrThrow(targetId);

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { status: AccountStatus.SUSPENDED },
    });
    await this.sessionService.revokeAllForUser(targetId);

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'ADMIN_SUSPENDED',
      targetType: 'User',
      targetId,
    });

    return this.toSummary(updated);
  }

  async reactivate(actor: RequestUser, targetId: string) {
    this.assertActorIsSuperAdmin(actor);
    await this.getMutableTargetOrThrow(targetId);

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { status: AccountStatus.ACTIVE },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'ADMIN_REACTIVATED',
      targetType: 'User',
      targetId,
    });

    return this.toSummary(updated);
  }

  async resetPassword(actor: RequestUser, targetId: string) {
    this.assertActorIsSuperAdmin(actor);
    const target = await this.getMutableTargetOrThrow(targetId);
    if (target.status !== AccountStatus.ACTIVE) {
      throw new ConflictException('Only active administrators can be reset');
    }
    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const passwordResetAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: true, passwordResetAt },
      });
      await tx.authSession.updateMany({
        where: { userId: targetId, revoked: false },
        data: { revoked: true, revokedAt: passwordResetAt },
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'ADMIN_PASSWORD_RESET',
        targetType: 'User',
        targetId,
      });
    });
    return {
      temporaryPassword,
      passwordResetAt,
      role: target.role,
      scope: await accountScope(this.prisma, target),
    };
  }

  private async validateCourses(courseIds: string[]) {
    if (!courseIds.length) return;
    if (
      (await this.prisma.course.count({ where: { id: { in: courseIds } } })) !==
      courseIds.length
    )
      throw new NotFoundException('Course not found');
  }

  async replaceScope(
    actor: RequestUser,
    targetId: string,
    courseIds: string[],
  ) {
    this.assertActorIsSuperAdmin(actor);
    const target = await this.getMutableTargetOrThrow(targetId);
    if (target.role !== Role.TEACHER)
      throw new BadRequestException('Only teacher scope can be assigned');
    await this.validateCourses(courseIds);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${targetId} FOR UPDATE`;
      await tx.teacherCourseAssignment.deleteMany({
        where: { teacherId: targetId },
      });
      await tx.teacherCourseAssignment.createMany({
        data: courseIds.map((courseId) => ({ teacherId: targetId, courseId })),
      });
      await this.auditService.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'TEACHER_SCOPE_REPLACED',
        targetType: 'User',
        targetId,
        metadata: { courseIds },
      });
    });
    return this.toSummary(target);
  }

  private async toSummary(user: {
    id: string;
    role: Role;
    status: AccountStatus;
    loginIdentifier: string;
    createdAt: Date;
    lastLoginAt: Date | null;
  }) {
    return {
      id: user.id,
      role: user.role,
      scope: await accountScope(this.prisma, user),
      status: user.status,
      loginIdentifier: user.loginIdentifier,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
