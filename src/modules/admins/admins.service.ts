import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  type PaginationQueryDto,
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
    if (target.role !== Role.ADMIN) {
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

    const passwordHash = await this.passwordService.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        role: Role.ADMIN,
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
      metadata: { email: normalizedEmail },
    });

    return this.toSummary(created);
  }

  async list(actor: RequestUser, pagination: PaginationQueryDto) {
    this.assertActorIsSuperAdmin(actor);
    const where = { role: Role.ADMIN };
    const [admins, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: admins.map((admin) => this.toSummary(admin)),
      meta: toPaginationMeta(pagination.page, pagination.limit, total),
    };
  }

  async getById(actor: RequestUser, targetId: string) {
    this.assertActorIsSuperAdmin(actor);
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
    });
    if (!target || target.role !== Role.ADMIN) {
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

  private toSummary(user: {
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
      status: user.status,
      loginIdentifier: user.loginIdentifier,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
