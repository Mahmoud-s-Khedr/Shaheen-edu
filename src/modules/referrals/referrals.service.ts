import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerType, ReferralCommissionKind, ReferralProgramStatus, Role } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { CreateReferralCodeDto, CreateReferralCommissionRuleDto, CreateReferralProgramDto, ReferralProgramsQueryDto, UpdateReferralCodeDto, UpdateReferralProgramDto } from './dto/referrals.dto';

@Injectable()
export class ReferralsService {
  private readonly referralsEnabled: boolean;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, config?: ConfigService<AppConfig, true>) { this.referralsEnabled = (config?.get('features', { infer: true }) ?? { referralsEnabled: false }).referralsEnabled; }

  private admin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private dates(startsAt?: Date, endsAt?: Date | null) { if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt'); }
  private async referralPartner(userId: string) {
    const profile = await this.prisma.partnerProfile.findUnique({ where: { userId } });
    if (!profile || profile.partnerType !== PartnerType.REFERRAL_PARTNER) throw new BadRequestException('Partner must be a REFERRAL_PARTNER');
  }
  async programOrThrow(id: string) {
    const program = await this.prisma.referralProgram.findUnique({ where: { id }, include: { codes: true, rules: { orderBy: { version: 'desc' } }, partner: { select: { displayName: true } } } });
    if (!program) throw new NotFoundException('Referral program not found');
    return program;
  }
  private async target(data: { appliesToAll?: boolean; courseId?: string | null; chapterId?: string | null }) {
    if (data.appliesToAll !== false) {
      if (data.courseId || data.chapterId) throw new BadRequestException('Global programs cannot specify a coverage target');
      return;
    }
    if ([data.courseId, data.chapterId].filter(Boolean).length !== 1) throw new BadRequestException('Scoped programs require exactly one courseId or chapterId');
    const exists = data.courseId ? await this.prisma.course.findUnique({ where: { id: data.courseId } }) : await this.prisma.chapter.findUnique({ where: { id: data.chapterId! } });
    if (!exists) throw new NotFoundException('Referral coverage target not found');
  }
  private rule(rule: CreateReferralCommissionRuleDto) {
    this.dates(rule.startsAt, rule.endsAt);
    if (rule.currency && rule.currency !== 'EGP') throw new BadRequestException('Only EGP is supported');
    if (rule.kind === ReferralCommissionKind.PERCENTAGE && rule.percentageBps === undefined) throw new BadRequestException('Percentage rules require percentageBps');
    if (rule.kind === ReferralCommissionKind.FIXED_PER_SALE && !rule.fixedCommissionMinor) throw new BadRequestException('Fixed rules require fixedCommissionMinor');
    if (rule.kind === ReferralCommissionKind.PERCENTAGE_CAPPED && (rule.percentageBps === undefined || !rule.maximumCommissionMinor)) throw new BadRequestException('Capped percentage rules require percentageBps and maximumCommissionMinor');
  }

  async createProgram(actor: RequestUser, dto: CreateReferralProgramDto) {
    this.admin(actor); this.dates(dto.startsAt, dto.endsAt); await this.referralPartner(dto.partnerUserId); await this.target(dto);
    const program = await this.prisma.referralProgram.create({ data: { ...dto, appliesToAll: dto.appliesToAll ?? true, createdById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_PROGRAM_CREATED', targetType: 'ReferralProgram', targetId: program.id });
    return this.programOrThrow(program.id);
  }
  async updateProgram(actor: RequestUser, id: string, dto: UpdateReferralProgramDto) {
    this.admin(actor); const prior = await this.programOrThrow(id);
    if (prior.status !== ReferralProgramStatus.DRAFT) throw new ConflictException('Only draft referral programs can be edited');
    const next = { ...prior, ...dto }; this.dates(next.startsAt, next.endsAt); await this.target(next);
    await this.prisma.referralProgram.update({ where: { id }, data: dto });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_PROGRAM_UPDATED', targetType: 'ReferralProgram', targetId: id, metadata: { fields: Object.keys(dto) } });
    return this.programOrThrow(id);
  }
  async activateProgram(actor: RequestUser, id: string) {
    this.admin(actor); if (!this.referralsEnabled) throw new ConflictException('Referral activation is disabled by rollout control'); const program = await this.programOrThrow(id);
    if (program.status !== ReferralProgramStatus.DRAFT) throw new ConflictException('Only draft referral programs can be activated');
    this.dates(program.startsAt, program.endsAt); await this.referralPartner(program.partnerUserId); await this.target(program);
    await this.prisma.referralProgram.update({ where: { id }, data: { status: ReferralProgramStatus.ACTIVE } });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_PROGRAM_ACTIVATED', targetType: 'ReferralProgram', targetId: id });
    return this.programOrThrow(id);
  }
  async getProgram(actor: RequestUser, id: string) { this.admin(actor); return this.programOrThrow(id); }
  async setProgramStatus(actor: RequestUser, id: string, status: 'ENDED' | 'SUSPENDED') {
    this.admin(actor); const program = await this.programOrThrow(id);
    if (program.status !== ReferralProgramStatus.ACTIVE) throw new ConflictException('Only active referral programs can be ended or suspended');
    await this.prisma.referralProgram.update({ where: { id }, data: { status, ...(status === ReferralProgramStatus.ENDED ? { endsAt: new Date() } : {}) } });
    await this.audit.record({ actorUserId: actor.id, action: `REFERRAL_PROGRAM_${status}`, targetType: 'ReferralProgram', targetId: id });
    return this.programOrThrow(id);
  }
  async createCode(actor: RequestUser, programId: string, dto: CreateReferralCodeDto) {
    this.admin(actor); const program = await this.programOrThrow(programId); this.dates(dto.startsAt, dto.endsAt);
    if (program.status === ReferralProgramStatus.ENDED) throw new ConflictException('Cannot add a code to an ended program');
    const code = dto.code.trim().toUpperCase(); if (code.length < 2) throw new BadRequestException('Referral code must contain at least two characters');
    try {
      const created = await this.prisma.referralCode.create({ data: { ...dto, code, programId, isActive: dto.isActive ?? true } });
      await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_CODE_CREATED', targetType: 'ReferralCode', targetId: created.id, metadata: { programId } });
      return created;
    } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Referral code already exists'); throw error; }
  }
  async updateCode(actor: RequestUser, id: string, dto: UpdateReferralCodeDto) {
    this.admin(actor); const prior = await this.prisma.referralCode.findUnique({ where: { id } }); if (!prior) throw new NotFoundException('Referral code not found');
    this.dates(dto.startsAt ?? prior.startsAt ?? undefined, dto.endsAt === undefined ? prior.endsAt : dto.endsAt);
    const updated = await this.prisma.referralCode.update({ where: { id }, data: dto });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_CODE_UPDATED', targetType: 'ReferralCode', targetId: id, metadata: { fields: Object.keys(dto) } });
    return updated;
  }
  async createRule(actor: RequestUser, programId: string, dto: CreateReferralCommissionRuleDto) {
    this.admin(actor); await this.programOrThrow(programId); this.rule(dto);
    const latest = await this.prisma.referralCommissionRule.findFirst({ where: { programId }, orderBy: { version: 'desc' }, select: { version: true } });
    const created = await this.prisma.referralCommissionRule.create({ data: { ...dto, currency: dto.currency ?? 'EGP', programId, version: (latest?.version ?? 0) + 1 } });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_RULE_CREATED', targetType: 'ReferralCommissionRule', targetId: created.id, metadata: { programId, version: created.version } });
    return created;
  }
  async activateRule(actor: RequestUser, programId: string, ruleId: string) {
    this.admin(actor); await this.programOrThrow(programId);
    const rule = await this.prisma.referralCommissionRule.findFirst({ where: { id: ruleId, programId } }); if (!rule) throw new NotFoundException('Referral commission rule not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.referralCommissionRule.updateMany({ where: { programId, isActive: true }, data: { isActive: false } });
      await tx.referralCommissionRule.update({ where: { id: ruleId }, data: { isActive: true } });
    });
    await this.audit.record({ actorUserId: actor.id, action: 'REFERRAL_RULE_ACTIVATED', targetType: 'ReferralCommissionRule', targetId: ruleId, metadata: { programId } });
    return this.prisma.referralCommissionRule.findUniqueOrThrow({ where: { id: ruleId } });
  }
  async listPrograms(actor: RequestUser, query: ReferralProgramsQueryDto) {
    this.admin(actor); const where = query.partnerUserId ? { partnerUserId: query.partnerUserId } : {};
    const [data, total] = await this.prisma.$transaction([this.prisma.referralProgram.findMany({ where, include: { partner: { select: { displayName: true } }, _count: { select: { codes: true, rules: true, attributions: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.referralProgram.count({ where })]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
}
