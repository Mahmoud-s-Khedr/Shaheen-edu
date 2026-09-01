import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AccountStatus,
  EntitlementSource,
  EntitlementStatus,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  toPaginationMeta,
  type PaginationQueryDto,
} from '../../common/dto/pagination-query.dto';
import type { GrantEntitlementDto } from './dto/grant-entitlement.dto';

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private entitlementDto(entitlement: any) {
    const {
      student,
      course,
      chapter,
      orderItem,
      grantedBy,
      revokedBy,
      ...record
    } = entitlement;
    return {
      ...record,
      studentName: student?.fullName ?? null,
      targetName: course?.title ?? chapter?.title ?? null,
      orderItemName: orderItem?.titleSnapshot ?? null,
      grantedByName: grantedBy?.loginIdentifier ?? null,
      revokedByName: revokedBy?.loginIdentifier ?? null,
    };
  }

  async grant(actor: RequestUser, dto: GrantEntitlementDto) {
    this.assertAdmin(actor);
    if (Boolean(dto.courseId) === Boolean(dto.chapterId))
      throw new BadRequestException(
        'Provide exactly one courseId or chapterId',
      );
    if (dto.expiresAt && dto.startsAt && dto.expiresAt <= dto.startsAt)
      throw new BadRequestException('expiresAt must be after startsAt');
    if (dto.source === EntitlementSource.PAYMENT)
      throw new BadRequestException(
        'PAYMENT entitlements can only be created by payment approval',
      );
    const student = await this.prisma.user.findFirst({
      where: {
        id: dto.studentUserId,
        role: Role.STUDENT,
        status: AccountStatus.ACTIVE,
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (
      dto.courseId &&
      !(await this.prisma.course.findUnique({ where: { id: dto.courseId } }))
    )
      throw new NotFoundException('Course not found');
    if (
      dto.chapterId &&
      !(await this.prisma.chapter.findUnique({ where: { id: dto.chapterId } }))
    )
      throw new NotFoundException('Chapter not found');
    const now = new Date();
    const entitlement = await this.prisma.$transaction(async (tx) => {
      // The partial unique indexes treat time-expired rows as ACTIVE until the
      // status is changed. Retire an expired grant for this exact target before
      // creating its replacement, while preserving the historical row.
      await tx.studentEntitlement.updateMany({
        where: {
          studentUserId: dto.studentUserId,
          courseId: dto.courseId ?? null,
          chapterId: dto.chapterId ?? null,
          status: EntitlementStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: {
          status: EntitlementStatus.REVOKED,
          revokedAt: now,
          revokedById: actor.id,
        },
      });
      return tx.studentEntitlement.create({
        data: {
          studentUserId: dto.studentUserId,
          courseId: dto.courseId,
          chapterId: dto.chapterId,
          source: dto.source ?? EntitlementSource.ADMIN,
          startsAt: dto.startsAt,
          expiresAt: dto.expiresAt,
          grantedById: actor.id,
        },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ENTITLEMENT_GRANTED',
      targetType: 'StudentEntitlement',
      targetId: entitlement.id,
      metadata: {
        studentUserId: dto.studentUserId,
        courseId: dto.courseId,
        chapterId: dto.chapterId,
      },
    });
    return this.entitlementDto(
      await this.prisma.studentEntitlement.findUnique({
        where: { id: entitlement.id },
        include: {
          student: { select: { fullName: true } },
          course: { select: { title: true } },
          chapter: { select: { title: true } },
          orderItem: { select: { titleSnapshot: true } },
          grantedBy: { select: { loginIdentifier: true } },
          revokedBy: { select: { loginIdentifier: true } },
        },
      }),
    );
  }

  async revoke(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const entitlement = await this.prisma.studentEntitlement.findUnique({
      where: { id },
    });
    if (!entitlement) throw new NotFoundException('Entitlement not found');
    await this.prisma.studentEntitlement.update({
      where: { id },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedById: actor.id,
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ENTITLEMENT_REVOKED',
      targetType: 'StudentEntitlement',
      targetId: id,
    });
    return this.entitlementDto(
      await this.prisma.studentEntitlement.findUnique({
        where: { id },
        include: {
          student: { select: { fullName: true } },
          course: { select: { title: true } },
          chapter: { select: { title: true } },
          orderItem: { select: { titleSnapshot: true } },
          grantedBy: { select: { loginIdentifier: true } },
          revokedBy: { select: { loginIdentifier: true } },
        },
      }),
    );
  }

  async revokeArchivedAccess(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const snapshot = await (
      this.prisma as any
    ).archivedAccessSnapshot.findUnique({ where: { id } });
    if (!snapshot)
      throw new NotFoundException('Archived access snapshot not found');
    const updated = await (this.prisma as any).archivedAccessSnapshot.update({
      where: { id },
      data: { revokedAt: new Date(), revokedById: actor.id },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'ARCHIVED_ACCESS_REVOKED',
      targetType: 'ArchivedAccessSnapshot',
      targetId: id,
    });
    return updated;
  }

  async list(
    actor: RequestUser,
    studentUserId: string | undefined,
    query: PaginationQueryDto,
  ) {
    this.assertAdmin(actor);
    const where = { studentUserId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentEntitlement.findMany({
        where,
        include: {
          student: { select: { fullName: true } },
          course: { select: { title: true } },
          chapter: { select: { title: true } },
          orderItem: { select: { titleSnapshot: true } },
          grantedBy: { select: { loginIdentifier: true } },
          revokedBy: { select: { loginIdentifier: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentEntitlement.count({ where }),
    ]);
    return {
      data: data.map((item) => this.entitlementDto(item)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }
}
