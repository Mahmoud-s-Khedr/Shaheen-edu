import { Prisma } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  arabicMatch,
  paginateArabicSearch,
} from '../../common/search/arabic-search';
import { PrismaService } from '../../database/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { SessionService } from '../auth/services/session.service';
import { AuditService } from '../audit/audit.service';
import { Role, AccountStatus } from '../../common/types/roles.enum';
import type { CreatePartnerDto } from './dto/create-partner.dto';
import type { UpdatePartnerDto } from './dto/update-partner.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  toPaginationMeta,
  type SearchPaginationQueryDto,
} from '../../common/dto/pagination-query.dto';

/**
 * Admin-side methods here are reached only via routes guarded by
 * @Roles(SUPER_ADMIN, ADMIN) - no extra actor-role re-check needed per the
 * plan's authorization matrix (unlike AdminsService, which guards the most
 * sensitive account type and re-checks defensively).
 */
@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {}

  async create(actor: RequestUser, dto: CreatePartnerDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { loginIdentifier: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          role: Role.PARTNER,
          status: AccountStatus.ACTIVE,
          loginIdentifier: normalizedEmail,
          passwordHash,
        },
      });
      await tx.partnerProfile.create({
        data: {
          userId: created.id,
          partnerType: dto.partnerType,
          displayName: dto.displayName,
          legalName: dto.legalName,
          phone: dto.phone,
          createdByAdminId: actor.id,
        },
      });
      return created;
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'PARTNER_CREATED',
      targetType: 'User',
      targetId: user.id,
      metadata: { email: normalizedEmail },
    });

    return this.getById(user.id);
  }

  async list(pagination: SearchPaginationQueryDto) {
    const where = { role: Role.PARTNER };
    const { data: partners, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.user,
      target: 'user',
      q: pagination.q,
      scope: {
        where: Prisma.sql`t.role = ${Role.PARTNER}::"Role"`,
        // The display and legal names live on the profile, so a hit there is
        // OR-ed with the login-identifier match on the user row itself.
        alsoMatches: Prisma.sql`EXISTS (
          SELECT 1 FROM "PartnerProfile" pp
          WHERE pp."userId" = t.id
            AND ${arabicMatch('partnerProfile', pagination.q ?? '', 'pp')}
        )`,
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where,
      args: { include: { partnerProfile: true } },
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      data: partners.map((partner) => this.toSummary(partner)),
      meta: toPaginationMeta(pagination.page, pagination.limit, total),
    };
  }

  async getById(id: string) {
    const partner = await this.prisma.user.findUnique({
      where: { id },
      include: { partnerProfile: true },
    });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }
    return this.toSummary(partner);
  }

  async update(actor: RequestUser, id: string, dto: UpdatePartnerDto) {
    const partner = await this.prisma.user.findUnique({ where: { id } });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }

    await this.prisma.partnerProfile.update({
      where: { userId: id },
      data: {
        displayName: dto.displayName,
        legalName: dto.legalName,
        phone: dto.phone,
      },
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'PARTNER_UPDATED',
      targetType: 'User',
      targetId: id,
    });

    return this.getById(id);
  }

  async updateOwnProfile(userId: string, dto: UpdatePartnerDto) {
    const partner = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }

    await this.prisma.partnerProfile.update({
      where: { userId },
      data: {
        displayName: dto.displayName,
        legalName: dto.legalName,
        phone: dto.phone,
      },
    });
    await this.auditService.record({
      actorUserId: userId,
      action: 'PARTNER_SELF_UPDATED',
      targetType: 'User',
      targetId: userId,
      metadata: { fields: Object.keys(dto) },
    });
    return this.getOwnProfile(userId);
  }

  async suspend(actor: RequestUser, id: string) {
    const partner = await this.prisma.user.findUnique({ where: { id } });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: AccountStatus.SUSPENDED },
    });
    await this.sessionService.revokeAllForUser(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'PARTNER_SUSPENDED',
      targetType: 'User',
      targetId: id,
    });
    return this.getById(id);
  }

  async reactivate(actor: RequestUser, id: string) {
    const partner = await this.prisma.user.findUnique({ where: { id } });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: AccountStatus.ACTIVE },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: 'PARTNER_REACTIVATED',
      targetType: 'User',
      targetId: id,
    });
    return this.getById(id);
  }

  /** Ownership is structural: keyed off req.user.id, never an id param. */
  async getOwnProfile(userId: string) {
    return this.getById(userId);
  }

  private toSummary(user: {
    id: string;
    status: AccountStatus;
    loginIdentifier: string;
    createdAt: Date;
    partnerProfile: {
      partnerType: string;
      displayName: string;
      legalName: string | null;
      phone: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      status: user.status,
      loginIdentifier: user.loginIdentifier,
      createdAt: user.createdAt,
      partnerType: user.partnerProfile?.partnerType,
      displayName: user.partnerProfile?.displayName,
      legalName: user.partnerProfile?.legalName,
      phone: user.partnerProfile?.phone,
    };
  }
}
