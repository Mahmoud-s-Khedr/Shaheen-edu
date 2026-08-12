import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerType, PublisherAgreementStatus, Role } from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { toPaginationMeta, type PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { CreateEarningsStatementDto, CreatePublisherAgreementDto, EndPublisherAgreementDto, PublisherAgreementsQueryDto, SetPricingDto, UpdatePublisherAgreementDto } from './dto/publisher-agreements.dto';

type Target = { courseId?: string; chapterId?: string; lessonId?: string };

@Injectable()
export class PublisherAgreementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertAdmin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private agreementDto(agreement: any) {
    const { publisher, course, chapter, lesson, ...record } = agreement;
    return {
      ...record,
      publisherName: publisher?.displayName ?? null,
      courseName: course?.title ?? null,
      chapterName: chapter?.title ?? null,
      lessonName: lesson?.title ?? null,
    };
  }
  private agreementInclude() {
    return {
      publisher: { select: { displayName: true } },
      course: { select: { title: true } },
      chapter: { select: { title: true } },
      lesson: { select: { title: true } },
    };
  }
  private targetKey(target: Target): ['courseId' | 'chapterId' | 'lessonId', string] { return target.courseId ? ['courseId', target.courseId] : target.chapterId ? ['chapterId', target.chapterId] : ['lessonId', target.lessonId!]; }
  private assertTarget(target: Target) { if ([target.courseId, target.chapterId, target.lessonId].filter(Boolean).length !== 1) throw new BadRequestException('Provide exactly one courseId, chapterId, or lessonId'); }
  private async assertTargetExists(target: Target) {
    this.assertTarget(target);
    const [field, id] = this.targetKey(target);
    const item = field === 'courseId' ? await this.prisma.course.findUnique({ where: { id } }) : field === 'chapterId' ? await this.prisma.chapter.findUnique({ where: { id } }) : await this.prisma.lesson.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`${field.replace('Id', '')} not found`);
  }
  private assertDates(startsAt: Date, endsAt?: Date | null) { if (endsAt && endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt'); }
  private async assertPublisher(id: string) { const partner = await this.prisma.partnerProfile.findUnique({ where: { userId: id } }); if (!partner || partner.partnerType !== PartnerType.CONTENT_PUBLISHER) throw new BadRequestException('Partner must be a CONTENT_PUBLISHER'); }
  private overlapWhere(target: Target, startsAt: Date, endsAt?: Date | null, omitId?: string) {
    const [field, id] = this.targetKey(target);
    return { [field]: id, status: PublisherAgreementStatus.ACTIVE, isPrimary: true, ...(omitId ? { id: { not: omitId } } : {}), startsAt: { lt: endsAt ?? new Date('9999-12-31T00:00:00.000Z') }, OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }] };
  }

  async create(actor: RequestUser, dto: CreatePublisherAgreementDto) {
    this.assertAdmin(actor); await this.assertTargetExists(dto); await this.assertPublisher(dto.publisherUserId); this.assertDates(dto.startsAt, dto.endsAt);
    const agreement = await this.prisma.publisherAgreement.create({ data: { ...dto, isPrimary: dto.isPrimary ?? true, createdById: actor.id } });
    await this.audit.record({ actorUserId: actor.id, action: 'PUBLISHER_AGREEMENT_CREATED', targetType: 'PublisherAgreement', targetId: agreement.id }); return this.agreementDto(await this.getOrThrow(agreement.id));
  }
  async update(actor: RequestUser, id: string, dto: UpdatePublisherAgreementDto) {
    this.assertAdmin(actor); const agreement = await this.getOrThrow(id); if (agreement.status !== PublisherAgreementStatus.DRAFT) throw new ConflictException('Only draft agreements can be updated');
    if (dto.publisherUserId) await this.assertPublisher(dto.publisherUserId); this.assertDates(dto.startsAt ?? agreement.startsAt, dto.endsAt ?? agreement.endsAt);
    await this.prisma.publisherAgreement.update({ where: { id }, data: dto }); await this.audit.record({ actorUserId: actor.id, action: 'PUBLISHER_AGREEMENT_UPDATED', targetType: 'PublisherAgreement', targetId: id }); return this.agreementDto(await this.getOrThrow(id));
  }
  async activate(actor: RequestUser, id: string) {
    this.assertAdmin(actor); const agreement = await this.getOrThrow(id); if (agreement.status !== PublisherAgreementStatus.DRAFT) throw new ConflictException('Only draft agreements can be activated');
    await this.assertPublisher(agreement.publisherUserId); this.assertDates(agreement.startsAt, agreement.endsAt);
    const target = { courseId: agreement.courseId ?? undefined, chapterId: agreement.chapterId ?? undefined, lessonId: agreement.lessonId ?? undefined };
    let updated;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        if (agreement.isPrimary && await tx.publisherAgreement.findFirst({ where: this.overlapWhere(target, agreement.startsAt, agreement.endsAt, id) })) throw new ConflictException('Primary agreement overlaps an active primary agreement for this target');
        return tx.publisherAgreement.update({ where: { id }, data: { status: PublisherAgreementStatus.ACTIVE } });
      }, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException('Agreement activation conflicted; retry the request');
      throw error;
    }
    await this.audit.record({ actorUserId: actor.id, action: 'PUBLISHER_AGREEMENT_ACTIVATED', targetType: 'PublisherAgreement', targetId: id }); return this.agreementDto(await this.getOrThrow(updated.id));
  }
  async end(actor: RequestUser, id: string, dto: EndPublisherAgreementDto) {
    this.assertAdmin(actor); const agreement = await this.getOrThrow(id); if (agreement.status !== PublisherAgreementStatus.ACTIVE) throw new ConflictException('Only active agreements can be ended'); const endsAt = dto.endsAt ?? new Date(); this.assertDates(agreement.startsAt, endsAt);
    await this.prisma.publisherAgreement.update({ where: { id }, data: { status: PublisherAgreementStatus.ENDED, endsAt } }); await this.audit.record({ actorUserId: actor.id, action: 'PUBLISHER_AGREEMENT_ENDED', targetType: 'PublisherAgreement', targetId: id }); return this.agreementDto(await this.getOrThrow(id));
  }
  async list(actor: RequestUser, query: PublisherAgreementsQueryDto) { this.assertAdmin(actor); const where = query.history ? {} : { status: { not: PublisherAgreementStatus.ENDED } }; const [data, total] = await this.prisma.$transaction([this.prisma.publisherAgreement.findMany({ where, include: this.agreementInclude(), orderBy: [{ startsAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.publisherAgreement.count({ where })]); return { data: data.map((item) => this.agreementDto(item)), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async getOrThrow(id: string) { const agreement = await this.prisma.publisherAgreement.findUnique({ where: { id }, include: this.agreementInclude() }); if (!agreement) throw new NotFoundException('Publisher agreement not found'); return agreement; }

  private async hierarchyTarget(target: Target): Promise<Target[]> {
    this.assertTarget(target); if (target.courseId) return [target];
    if (target.chapterId) { const chapter = await this.prisma.chapter.findUnique({ where: { id: target.chapterId } }); if (!chapter) throw new NotFoundException('chapter not found'); return [target, { courseId: chapter.courseId }]; }
    const lesson = await this.prisma.lesson.findUnique({ where: { id: target.lessonId }, include: { chapter: true } }); if (!lesson) throw new NotFoundException('lesson not found'); return [target, { chapterId: lesson.chapterId }, { courseId: lesson.chapter.courseId }];
  }
  async resolve(actor: RequestUser, target: Target, at = new Date()) {
    this.assertAdmin(actor); const targets = await this.hierarchyTarget(target);
    for (const candidate of targets) { const agreement = await this.prisma.publisherAgreement.findFirst({ where: { ...candidate, status: PublisherAgreementStatus.ACTIVE, isPrimary: true, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, include: this.agreementInclude() }); if (agreement) return { agreement: this.agreementDto(agreement), resolvedFrom: { ...candidate, courseName: agreement.course?.title ?? null, chapterName: agreement.chapter?.title ?? null, lessonName: agreement.lesson?.title ?? null } }; }
    return { agreement: null, resolvedFrom: null };
  }

  async setPricing(actor: RequestUser, target: Target, dto: SetPricingDto) {
    this.assertAdmin(actor); await this.assertTargetExists(target); if (dto.isPurchasable && (dto.priceMinor === undefined || dto.currency !== 'EGP')) throw new BadRequestException('Purchasable pricing requires an EGP priceMinor'); if (!dto.isPurchasable && (dto.priceMinor !== undefined || dto.currency !== undefined)) throw new BadRequestException('Non-purchasable pricing cannot include price or currency');
    const [field, id] = this.targetKey(target); const pricing = { isPurchasable: dto.isPurchasable, priceMinor: dto.isPurchasable ? dto.priceMinor : null, currency: dto.isPurchasable ? dto.currency : null };
    if (field === 'courseId') await this.prisma.course.update({ where: { id }, data: pricing }); else if (field === 'chapterId') await this.prisma.chapter.update({ where: { id }, data: pricing }); else await this.prisma.lesson.update({ where: { id }, data: pricing });
    await this.audit.record({ actorUserId: actor.id, action: 'CONTENT_PRICING_UPDATED', targetType: field.replace('Id', ''), targetId: id, metadata: pricing }); return this.resolvePricing(actor, target);
  }
  async resolvePricing(actor: RequestUser, target: Target) {
    this.assertAdmin(actor);
    const targets = await this.hierarchyTarget(target);

    for (const candidate of targets) {
      const [field, id] = this.targetKey(candidate);
      const value =
        field === 'courseId'
          ? await this.prisma.course.findUnique({
              where: { id },
              select: { title: true, priceMinor: true, currency: true, isPurchasable: true },
            })
          : field === 'chapterId'
            ? await this.prisma.chapter.findUnique({
                where: { id },
                select: { title: true, priceMinor: true, currency: true, isPurchasable: true },
              })
            : await this.prisma.lesson.findUnique({
                where: { id },
                select: { title: true, priceMinor: true, currency: true, isPurchasable: true },
              });

      if (!value) continue;
      if (field === 'courseId' || value.isPurchasable !== null) {
        return {
          ...value,
          resolvedFrom: {
            ...candidate,
            ...(field === 'courseId'
              ? { courseName: value.title }
              : field === 'chapterId'
                ? { chapterName: value.title }
                : { lessonName: value.title }),
          },
        };
      }
    }

    throw new NotFoundException('Content not found');
  }

  async createStatement(actor: RequestUser, dto: CreateEarningsStatementDto) {
    this.assertAdmin(actor); await this.assertTargetExists(dto); this.assertDates(dto.periodStartsAt, dto.periodEndsAt); if (dto.currency !== 'EGP') throw new BadRequestException('Only EGP is supported');
    const resolution = await this.resolve(actor, { courseId: dto.courseId, chapterId: dto.chapterId, lessonId: dto.lessonId }, dto.periodStartsAt); if (!resolution.agreement) throw new BadRequestException('No active primary publisher agreement covers this period'); const agreement = resolution.agreement;
    if (agreement.endsAt && dto.periodEndsAt > agreement.endsAt) throw new BadRequestException('Earning period crosses an agreement boundary; split the period');
    const publisherEarningsMinor = Math.floor((dto.grossRevenueMinor * agreement.revenueShareBps) / 10_000);
    const statement = await this.prisma.publisherEarningsStatement.create({ data: { ...dto, agreementId: agreement.id, revenueShareBps: agreement.revenueShareBps, publisherEarningsMinor, createdById: actor.id } }); await this.audit.record({ actorUserId: actor.id, action: 'PUBLISHER_EARNINGS_STATEMENT_CREATED', targetType: 'PublisherEarningsStatement', targetId: statement.id, metadata: { agreementId: agreement.id } }); return statement;
  }
  async listStatements(actor: RequestUser, query: PaginationQueryDto) { this.assertAdmin(actor); const [data, total] = await this.prisma.$transaction([this.prisma.publisherEarningsStatement.findMany({ include: { agreement: { include: { publisher: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.publisherEarningsStatement.count()]); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
}
