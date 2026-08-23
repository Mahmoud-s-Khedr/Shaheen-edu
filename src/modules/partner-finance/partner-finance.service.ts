import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerAllocationState, Role } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminAllocationsQueryDto, CreateSettlementDto, SettlementsQueryDto } from './dto/partner-finance.dto';

@Injectable()
export class PartnerFinanceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private admin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const start = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const end = to ? new Date(`${to}T23:59:59.999Z`) : undefined;
    if ((start && Number.isNaN(start.valueOf())) || (end && Number.isNaN(end.valueOf())) || (start && end && end < start)) throw new BadRequestException('Invalid date range');
    return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  }
  async allocations(actor: RequestUser, query: AdminAllocationsQueryDto) {
    this.admin(actor); const createdAt = this.dateRange(query.from, query.to);
    const where = { ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}), ...(query.kind ? { kind: query.kind } : {}), ...(query.state ? { state: query.state } : {}), ...(query.publisherAgreementId ? { publisherAgreementId: query.publisherAgreementId } : {}), ...(query.referralRuleId ? { referralRuleId: query.referralRuleId } : {}), ...(createdAt ? { createdAt } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partnerAllocation.findMany({ where, include: { partner: { select: { displayName: true } }, publisherAgreement: { select: { contractReference: true, version: true } }, referralRule: { select: { programId: true, version: true } }, settlementLines: { select: { settlementId: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.partnerAllocation.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async createSettlement(actor: RequestUser, dto: CreateSettlementDto) {
    this.admin(actor); const ids = [...new Set(dto.allocationIds)];
    if (ids.length !== dto.allocationIds.length) throw new BadRequestException('Each allocation can be selected only once');
    const settlement = await this.prisma.$transaction(async (tx) => {
      const allocations = await tx.partnerAllocation.findMany({ where: { id: { in: ids } } });
      if (allocations.length !== ids.length) throw new NotFoundException('One or more allocations were not found');
      const [first] = allocations;
      if (!allocations.every((row) => row.partnerUserId === first.partnerUserId && row.currency === first.currency && row.state === PartnerAllocationState.PAYABLE)) throw new BadRequestException('A settlement requires payable allocations for one partner and currency');
      const assigned = await tx.partnerSettlementLine.count({ where: { allocationId: { in: ids } } });
      if (assigned) throw new ConflictException('One or more allocations are already in a settlement');
      return tx.partnerSettlement.create({ data: { partnerUserId: first.partnerUserId, paymentReference: dto.paymentReference.trim(), currency: first.currency, totalMinor: allocations.reduce((sum, row) => sum + row.amountMinor, 0), createdById: actor.id, lines: { create: ids.map((allocationId) => ({ allocationId })) } }, include: { lines: { include: { allocation: true } } } });
    }, { isolationLevel: 'Serializable' });
    await this.audit.record({ actorUserId: actor.id, action: 'PARTNER_SETTLEMENT_CREATED', targetType: 'PartnerSettlement', targetId: settlement.id, metadata: { partnerUserId: settlement.partnerUserId, allocationCount: settlement.lines.length, totalMinor: settlement.totalMinor } });
    return settlement;
  }
  async markSettlementPaid(actor: RequestUser, id: string) {
    this.admin(actor); const now = new Date();
    const settlement = await this.prisma.$transaction(async (tx) => {
      const found = await tx.partnerSettlement.findUnique({ where: { id }, include: { lines: true } });
      if (!found) throw new NotFoundException('Partner settlement not found');
      if (found.paidAt) throw new ConflictException('Settlement is already marked paid');
      const updated = await tx.partnerAllocation.updateMany({ where: { id: { in: found.lines.map((line) => line.allocationId) }, state: PartnerAllocationState.PAYABLE }, data: { state: PartnerAllocationState.PAID, paidAt: now } });
      if (updated.count !== found.lines.length) throw new ConflictException('A settlement allocation is no longer payable');
      return tx.partnerSettlement.update({ where: { id }, data: { paidAt: now }, include: { lines: { include: { allocation: true } } } });
    }, { isolationLevel: 'Serializable' });
    await this.audit.record({ actorUserId: actor.id, action: 'PARTNER_SETTLEMENT_PAID', targetType: 'PartnerSettlement', targetId: id, metadata: { paidAt: now.toISOString() } });
    return settlement;
  }
  async settlements(actor: RequestUser, query: SettlementsQueryDto) {
    this.admin(actor); const createdAt = this.dateRange(query.from, query.to); const where = { ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}), ...(createdAt ? { createdAt } : {}) };
    const [data, total] = await this.prisma.$transaction([this.prisma.partnerSettlement.findMany({ where, include: { partner: { select: { displayName: true } }, _count: { select: { lines: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.partnerSettlement.count({ where })]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
}
