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
import {
  Role,
  AccountStatus,
  PartnerAllocationState,
  PublisherAgreementStatus,
  ReferralProgramStatus,
} from '../../common/types/roles.enum';
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

  /**
   * A finance/support history view for administrators. It deliberately returns
   * only partner-domain records and ledger aggregates: learner identities and
   * order rows are not selected, even though allocations are order-item based.
   */
  async detail(actor: RequestUser, id: string) {
    const partner = await this.prisma.user.findUnique({
      where: { id },
      include: { partnerProfile: true },
    });
    if (!partner || partner.role !== Role.PARTNER) {
      throw new NotFoundException('Partner not found');
    }

    const now = new Date();
    const [agreements, programs, allocationTotals, auditEvents] =
      await Promise.all([
        this.prisma.publisherAgreement.findMany({
          where: { publisherUserId: id },
          select: {
            id: true,
            status: true,
            payoutKind: true,
            revenueShareBps: true,
            fixedPayoutMinor: true,
            currency: true,
            contractReference: true,
            version: true,
            supersedesId: true,
            startsAt: true,
            endsAt: true,
            isPrimary: true,
            createdAt: true,
            course: { select: { id: true, title: true } },
            chapter: { select: { id: true, title: true, courseId: true } },
            lesson: {
              select: {
                id: true,
                title: true,
                chapterId: true,
                chapter: { select: { courseId: true } },
              },
            },
          },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.referralProgram.findMany({
          where: { partnerUserId: id },
          select: {
            id: true,
            name: true,
            status: true,
            startsAt: true,
            endsAt: true,
            usageLimit: true,
            perStudentUsageLimit: true,
            appliesToAll: true,
            createdAt: true,
            course: { select: { id: true, title: true } },
            chapter: { select: { id: true, title: true, courseId: true } },
            _count: { select: { codes: true, rules: true } },
          },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.partnerAllocation.groupBy({
          by: ['state', 'currency'],
          where: { partnerUserId: id },
          _count: { _all: true },
          _sum: { basisMinor: true, amountMinor: true },
        }),
        this.prisma.adminAuditLog.findMany({
          where: { targetId: id },
          select: {
            id: true,
            action: true,
            targetType: true,
            createdAt: true,
            correlationId: true,
            actorUserId: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
      ]);

    const byState = new Map(
      allocationTotals.map((row) => [
        `${row.state}:${row.currency}`,
        {
          state: row.state,
          currency: row.currency,
          allocationCount: row._count._all,
          basisMinor: row._sum.basisMinor ?? 0,
          amountMinor: row._sum.amountMinor ?? 0,
        },
      ]),
    );
    const allocationSummary = Object.values(PartnerAllocationState).flatMap(
      (state) => {
        const matching = [...byState.values()].filter(
          (row) => row.state === state,
        );
        return matching.length
          ? matching
          : [
              {
                state,
                currency: 'EGP',
                allocationCount: 0,
                basisMinor: 0,
                amountMinor: 0,
              },
            ];
      },
    );

    await this.auditService.record({
      actorUserId: actor.id,
      action: 'PARTNER_DETAIL_VIEWED',
      targetType: 'User',
      targetId: id,
      metadata: {
        agreementCount: agreements.length,
        referralProgramCount: programs.length,
        auditSummaryLimit: 20,
      },
    });

    return {
      account: this.toSummary(partner),
      capability: {
        partnerType: partner.partnerProfile?.partnerType ?? null,
        canPublishContent:
          partner.partnerProfile?.partnerType === 'CONTENT_PUBLISHER',
        canReferCustomers:
          partner.partnerProfile?.partnerType === 'REFERRAL_PARTNER',
      },
      publisherAgreements: agreements.map((agreement) => ({
        ...agreement,
        isCurrent:
          agreement.status === PublisherAgreementStatus.ACTIVE &&
          agreement.startsAt <= now &&
          (!agreement.endsAt || agreement.endsAt > now),
        target: agreement.course
          ? { type: 'COURSE', ...agreement.course }
          : agreement.chapter
            ? { type: 'CHAPTER', ...agreement.chapter }
            : agreement.lesson
              ? {
                  type: 'LESSON',
                  id: agreement.lesson.id,
                  title: agreement.lesson.title,
                  chapterId: agreement.lesson.chapterId,
                  courseId: agreement.lesson.chapter.courseId,
                }
              : null,
      })),
      referralPrograms: programs.map((program) => ({
        ...program,
        isCurrent:
          program.status === ReferralProgramStatus.ACTIVE &&
          program.startsAt <= now &&
          (!program.endsAt || program.endsAt > now),
        target: program.course
          ? { type: 'COURSE', ...program.course }
          : program.chapter
            ? { type: 'CHAPTER', ...program.chapter }
            : { type: 'ALL_CONTENT' },
      })),
      allocationTotalsByState: allocationSummary,
      auditSummary: { recentEvents: auditEvents, limit: 20 },
    };
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
