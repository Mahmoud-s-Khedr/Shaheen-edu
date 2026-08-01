import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EntitlementSource, EntitlementStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { GrantEntitlementDto } from './dto/grant-entitlement.dto';

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden');
  }

  async grant(actor: RequestUser, dto: GrantEntitlementDto) {
    this.assertAdmin(actor);
    if (Boolean(dto.courseId) === Boolean(dto.chapterId)) throw new BadRequestException('Provide exactly one courseId or chapterId');
    if (dto.expiresAt && dto.startsAt && dto.expiresAt <= dto.startsAt) throw new BadRequestException('expiresAt must be after startsAt');
    const student = await this.prisma.user.findFirst({ where: { id: dto.studentUserId, role: Role.STUDENT } });
    if (!student) throw new NotFoundException('Student not found');
    if (dto.courseId && !(await this.prisma.course.findUnique({ where: { id: dto.courseId } }))) throw new NotFoundException('Course not found');
    if (dto.chapterId && !(await this.prisma.chapter.findUnique({ where: { id: dto.chapterId } }))) throw new NotFoundException('Chapter not found');
    const entitlement = await this.prisma.studentEntitlement.create({ data: { studentUserId: dto.studentUserId, courseId: dto.courseId, chapterId: dto.chapterId, source: dto.source ?? EntitlementSource.ADMIN, startsAt: dto.startsAt, expiresAt: dto.expiresAt, grantedById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'ENTITLEMENT_GRANTED', targetType: 'StudentEntitlement', targetId: entitlement.id, metadata: { studentUserId: dto.studentUserId, courseId: dto.courseId, chapterId: dto.chapterId } });
    return entitlement;
  }

  async revoke(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const entitlement = await this.prisma.studentEntitlement.findUnique({ where: { id } });
    if (!entitlement) throw new NotFoundException('Entitlement not found');
    const updated = await this.prisma.studentEntitlement.update({ where: { id }, data: { status: EntitlementStatus.REVOKED, revokedAt: new Date(), revokedById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'ENTITLEMENT_REVOKED', targetType: 'StudentEntitlement', targetId: id });
    return updated;
  }

  async revokeArchivedAccess(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const snapshot = await (this.prisma as any).archivedAccessSnapshot.findUnique({ where: { id } });
    if (!snapshot) throw new NotFoundException('Archived access snapshot not found');
    const updated = await (this.prisma as any).archivedAccessSnapshot.update({ where: { id }, data: { revokedAt: new Date(), revokedById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'ARCHIVED_ACCESS_REVOKED', targetType: 'ArchivedAccessSnapshot', targetId: id });
    return updated;
  }

  async list(actor: RequestUser, studentUserId?: string) {
    this.assertAdmin(actor);
    return this.prisma.studentEntitlement.findMany({ where: { studentUserId }, orderBy: { createdAt: 'desc' } });
  }
}
