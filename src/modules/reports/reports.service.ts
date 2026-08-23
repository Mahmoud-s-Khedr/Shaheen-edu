import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import {
  ReportDataClassification,
  ReportExportStatus,
  Role,
} from '../../common/types/roles.enum';
import { PrivacyPolicy } from '../../common/privacy/privacy-policy';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import { AuditService } from '../audit/audit.service';
import { ReportExportQueue } from './report-export.queue';
import {
  REPORT_TYPES,
  type CreateReportExportDto,
  type PlatformReportQueryDto,
  type ReportExportsQueryDto,
  type ReportType,
} from './dto/reports.dto';

interface ReportExportPolicy {
  classification: ReportDataClassification;
  columns: readonly string[];
  roles: readonly Role[];
  privileged: boolean;
  retentionMs: number;
  signedUrlMs: number;
}

/** Learner/contact-data reports must be added here explicitly. Phase 1 has none. */
export const REPORT_EXPORT_POLICIES: Record<ReportType, ReportExportPolicy> = {
  COMMERCE: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'createdAt',
      'status',
      'paymentChannel',
      'subtotalMinor',
      'discountMinor',
      'totalMinor',
      'currency',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  PARTNER_OBLIGATIONS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'createdAt',
      'partnerUserId',
      'kind',
      'state',
      'basisMinor',
      'amountMinor',
      'currency',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  PUBLISHER_ALLOCATIONS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'id',
      'createdAt',
      'partnerUserId',
      'publisherAgreementId',
      'agreementVersion',
      'contractReference',
      'state',
      'basisMinor',
      'amountMinor',
      'currency',
      'payableAt',
      'paidAt',
      'reversedAt',
      'reversedAllocationId',
      'settlementId',
      'paymentReference',
      'settlementPaidAt',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  PUBLISHER_SETTLEMENTS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'id',
      'createdAt',
      'partnerUserId',
      'paymentReference',
      'currency',
      'settlementTotalMinor',
      'paidAt',
      'publisherAllocationCount',
      'publisherTotalMinor',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  REFERRAL_ALLOCATIONS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'createdAt',
      'partnerUserId',
      'state',
      'basisMinor',
      'amountMinor',
      'currency',
      'payableAt',
      'paidAt',
      'reversedAt',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  REFERRAL_SETTLEMENTS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'createdAt',
      'partnerUserId',
      'paymentReference',
      'currency',
      'referralTotalMinor',
      'paidAt',
      'referralAllocationCount',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: true,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
  ENTITLEMENTS: {
    classification: ReportDataClassification.NON_PII,
    columns: [
      'createdAt',
      'source',
      'status',
      'startsAt',
      'expiresAt',
      'revokedAt',
    ],
    roles: [Role.ADMIN, Role.SUPER_ADMIN],
    privileged: false,
    retentionMs: 24 * 60 * 60 * 1000,
    signedUrlMs: 15 * 60 * 1000,
  },
};

@Injectable()
export class ReportsService {
  private readonly exportsEnabled: boolean;
  private readonly privacy: PrivacyPolicy;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: ReportExportQueue,
    private readonly storage: BunnyStorageProvider,
    config?: ConfigService<AppConfig, true>,
  ) {
    this.exportsEnabled = (
      config?.get('features', { infer: true }) ?? {
        reportExportsEnabled: false,
      }
    ).reportExportsEnabled;
    this.privacy = new PrivacyPolicy(config?.get('privacy', { infer: true }));
  }

  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private dates(query: PlatformReportQueryDto) {
    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    if (
      (from && Number.isNaN(from.valueOf())) ||
      (to && Number.isNaN(to.valueOf())) ||
      (from && to && to < from)
    )
      throw new BadRequestException('Invalid date range');
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private escape(value: unknown) {
    const text =
      value instanceof Date ? value.toISOString() : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  async commerce(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    const createdAt = this.dates(query);
    const rows = await this.prisma.order.groupBy({
      by: ['status', 'paymentChannel', 'currency'],
      where: { ...(Object.keys(createdAt).length ? { createdAt } : {}) },
      _count: true,
      _sum: { subtotalMinor: true, discountMinor: true, totalMinor: true },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        orders: row._count,
        subtotalMinor: row._sum.subtotalMinor ?? 0,
        discountMinor: row._sum.discountMinor ?? 0,
        totalMinor: row._sum.totalMinor ?? 0,
      })),
      retention:
        'Financial aggregates and allocation records are retained for seven years.',
    };
  }

  async partnerObligations(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    const createdAt = this.dates(query);
    const rows = await this.prisma.partnerAllocation.groupBy({
      by: ['kind', 'state', 'currency'],
      where: {
        ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}),
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
      },
      _count: true,
      _sum: { amountMinor: true },
    });
    return {
      data: rows.map((row) => ({
        ...row,
        allocations: row._count,
        amountMinor: row._sum.amountMinor ?? 0,
      })),
    };
  }

  async requestExport(actor: RequestUser, dto: CreateReportExportDto) {
    this.admin(actor);
    if (!this.exportsEnabled)
      throw new ConflictException(
        'Report exports are disabled by rollout control',
      );
    if (!REPORT_TYPES.includes(dto.reportType))
      throw new BadRequestException('Unsupported report type');
    const policy = this.exportPolicy(dto.reportType);
    if (!policy.roles.includes(actor.role))
      throw new ForbiddenException(
        'This role cannot request the selected report',
      );
    const columns = [...new Set(dto.columns)];
    if (
      !columns.length ||
      columns.some((column) => !policy.columns.includes(column))
    )
      throw new BadRequestException(
        'One or more selected columns are not allowed for this report',
      );
    const reason = policy.privileged
      ? this.privacy.assertPrivilegedExportReason(dto.reason)
      : dto.reason?.trim() || undefined;
    const filters = {
      ...(dto.from ? { from: dto.from } : {}),
      ...(dto.to ? { to: dto.to } : {}),
      ...(dto.partnerUserId ? { partnerUserId: dto.partnerUserId } : {}),
    };
    const job = await this.prisma.reportExportJob.create({
      data: {
        requestedById: actor.id,
        reportType: dto.reportType,
        filters,
        columns,
        reason: reason ?? null,
        containsPii:
          policy.classification === ReportDataClassification.PII_RESTRICTED,
        classification: policy.classification,
      },
    });
    try {
      await this.queue.enqueue(job.id);
    } catch {
      await this.prisma.reportExportJob.update({
        where: { id: job.id },
        data: {
          status: ReportExportStatus.FAILED,
          error: 'Export queue is unavailable',
        },
      });
      throw new ConflictException('Export queue is unavailable');
    }
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REPORT_EXPORT_REQUESTED',
      targetType: 'ReportExportJob',
      targetId: job.id,
      metadata: {
        reportType: dto.reportType,
        classification: policy.classification,
        containsPii:
          policy.classification === ReportDataClassification.PII_RESTRICTED,
        columns,
        ...(reason ? { reason } : {}),
      },
    });
    return job;
  }

  async exports(actor: RequestUser, query: ReportExportsQueryDto) {
    this.admin(actor);
    if (!this.exportsEnabled)
      throw new ConflictException(
        'Report exports are disabled by rollout control',
      );
    const where =
      actor.role === Role.SUPER_ADMIN ? {} : { requestedById: actor.id };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.reportExportJob.findMany({
        where,
        select: {
          id: true,
          reportType: true,
          classification: true,
          status: true,
          rowCount: true,
          expiresAt: true,
          createdAt: true,
          cancelledAt: true,
          error: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.reportExportJob.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }

  async download(actor: RequestUser, id: string) {
    this.admin(actor);
    const job = await this.prisma.reportExportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Export not found');
    this.assertExportOwner(actor, job);
    if (
      job.status !== ReportExportStatus.COMPLETED ||
      !job.storageKey ||
      !job.expiresAt ||
      job.expiresAt <= new Date()
    )
      throw new ConflictException('Export is not available');
    const policy = this.exportPolicy(job.reportType);
    const now = new Date();
    const urlExpiresAt = new Date(
      Math.min(job.expiresAt.getTime(), now.getTime() + policy.signedUrlMs),
    );
    await this.prisma.reportExportJob.update({
      where: { id },
      data: { downloadedAt: now },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REPORT_EXPORT_DOWNLOADED',
      targetType: 'ReportExportJob',
      targetId: id,
      metadata: {
        reportType: job.reportType,
        classification: job.classification,
        urlExpiresAt: urlExpiresAt.toISOString(),
      },
    });
    return {
      url: this.storage.createProtectedUrl(job.storageKey, urlExpiresAt),
      expiresAt: urlExpiresAt,
    };
  }

  async cancel(actor: RequestUser, id: string) {
    this.admin(actor);
    const job = await this.prisma.reportExportJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Export not found');
    this.assertExportOwner(actor, job);
    const cancelledAt = new Date();
    const updated = await this.prisma.reportExportJob.updateMany({
      where: {
        id,
        status: {
          in: [ReportExportStatus.QUEUED, ReportExportStatus.PROCESSING],
        },
      },
      data: { status: ReportExportStatus.CANCELLED, cancelledAt },
    });
    if (!updated.count)
      throw new ConflictException(
        'Only queued or processing exports can be cancelled',
      );
    await this.audit.record({
      actorUserId: actor.id,
      action: 'REPORT_EXPORT_CANCELLED',
      targetType: 'ReportExportJob',
      targetId: id,
      metadata: { classification: job.classification },
    });
    return this.prisma.reportExportJob.findUniqueOrThrow({ where: { id } });
  }

  async generate(jobId: string) {
    const claimed = await this.prisma.reportExportJob.updateMany({
      where: { id: jobId, status: ReportExportStatus.QUEUED },
      data: { status: ReportExportStatus.PROCESSING },
    });
    if (!claimed.count) return;
    const job = await this.prisma.reportExportJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    try {
      const policy = this.exportPolicy(job.reportType);
      if (job.classification && job.classification !== policy.classification)
        throw new ConflictException(
          'Export classification no longer matches its report policy',
        );
      const filters = job.filters as PlatformReportQueryDto;
      const columns = job.columns as string[];
      const createdAt = this.dates(filters);
      const rows = await this.rowsFor(job.reportType, filters, createdAt);
      const watermark = this.watermark(
        job.id,
        job.requestedById,
        policy.classification,
      );
      const expiresAt = new Date(Date.now() + policy.retentionMs);
      const csv = `# ${watermark}\n# Retain only until ${expiresAt.toISOString()}\n${columns.join(',')}\n${rows.map((row) => columns.map((column) => this.escape(row[column])).join(',')).join('\n')}\n`;
      const key = `private/reports/${job.id}.csv`;
      await this.storage.upload(
        key,
        Readable.from([csv]),
        'text/csv; charset=utf-8',
        { classification: policy.classification, watermark },
      );
      const completed = await this.prisma.reportExportJob.updateMany({
        where: { id: job.id, status: ReportExportStatus.PROCESSING },
        data: {
          status: ReportExportStatus.COMPLETED,
          storageKey: key,
          rowCount: rows.length,
          expiresAt,
        },
      });
      if (!completed.count) await this.storage.delete(key);
    } catch (error: any) {
      await this.prisma.reportExportJob.updateMany({
        where: { id: job.id, status: ReportExportStatus.PROCESSING },
        data: {
          status: ReportExportStatus.FAILED,
          error: String(error?.message ?? 'Export generation failed').slice(
            0,
            1000,
          ),
        },
      });
      throw error;
    }
  }

  async expireCompletedExports(now = new Date()) {
    const expired = await this.prisma.reportExportJob.findMany({
      where: {
        status: ReportExportStatus.COMPLETED,
        expiresAt: { lte: now },
        storageKey: { not: null },
      },
      select: {
        id: true,
        storageKey: true,
        requestedById: true,
        classification: true,
      },
    });
    let cleaned = 0;
    for (const job of expired) {
      await this.storage.delete(job.storageKey!);
      const updated = await this.prisma.reportExportJob.updateMany({
        where: {
          id: job.id,
          status: ReportExportStatus.COMPLETED,
          expiresAt: { lte: now },
        },
        data: { status: ReportExportStatus.EXPIRED, storageKey: null },
      });
      if (updated.count) {
        cleaned += updated.count;
        await this.audit.record({
          actorUserId: job.requestedById,
          action: 'REPORT_EXPORT_EXPIRED',
          targetType: 'ReportExportJob',
          targetId: job.id,
          metadata: { classification: job.classification },
        });
      }
    }
    return { scanned: expired.length, cleaned };
  }

  private exportPolicy(reportType: string): ReportExportPolicy {
    if (!REPORT_TYPES.includes(reportType as ReportType))
      throw new BadRequestException('Unsupported report type');
    return REPORT_EXPORT_POLICIES[reportType as ReportType];
  }

  private assertExportOwner(
    actor: RequestUser,
    job: { requestedById: string },
  ) {
    if (actor.role !== Role.SUPER_ADMIN && job.requestedById !== actor.id)
      throw new ForbiddenException('Export belongs to another administrator');
  }

  private watermark(
    jobId: string,
    requestedById: string,
    classification: ReportDataClassification,
  ) {
    return `CONFIDENTIAL EXPORT | ${classification} | job=${jobId} | requester=${requestedById}`;
  }

  private async rowsFor(
    reportType: string,
    filters: PlatformReportQueryDto,
    createdAt: { gte?: Date; lte?: Date },
  ): Promise<Array<Record<string, unknown>>> {
    const dateFilter = Object.keys(createdAt).length ? { createdAt } : {};
    if (reportType === 'COMMERCE')
      return this.prisma.order.findMany({
        where: dateFilter,
        select: {
          createdAt: true,
          status: true,
          paymentChannel: true,
          subtotalMinor: true,
          discountMinor: true,
          totalMinor: true,
          currency: true,
        },
      });
    if (reportType === 'PARTNER_OBLIGATIONS')
      return this.prisma.partnerAllocation.findMany({
        where: {
          ...(filters.partnerUserId
            ? { partnerUserId: filters.partnerUserId }
            : {}),
          ...dateFilter,
        },
        select: {
          createdAt: true,
          partnerUserId: true,
          kind: true,
          state: true,
          basisMinor: true,
          amountMinor: true,
          currency: true,
        },
      });
    if (reportType === 'PUBLISHER_ALLOCATIONS') {
      const rows = await this.prisma.partnerAllocation.findMany({
        where: {
          kind: 'PUBLISHER_SALE',
          ...(filters.partnerUserId
            ? { partnerUserId: filters.partnerUserId }
            : {}),
          ...dateFilter,
        },
        select: {
          id: true,
          createdAt: true,
          partnerUserId: true,
          publisherAgreementId: true,
          state: true,
          basisMinor: true,
          amountMinor: true,
          currency: true,
          payableAt: true,
          paidAt: true,
          reversedAt: true,
          reversedAllocationId: true,
          publisherAgreement: {
            select: { version: true, contractReference: true },
          },
          settlementLines: {
            select: {
              settlement: {
                select: { id: true, paymentReference: true, paidAt: true },
              },
            },
          },
        },
      });
      return rows.map((row) => {
        const settlement = row.settlementLines[0]?.settlement ?? null;
        return {
          id: row.id,
          createdAt: row.createdAt,
          partnerUserId: row.partnerUserId,
          publisherAgreementId: row.publisherAgreementId,
          agreementVersion: row.publisherAgreement?.version ?? null,
          contractReference: row.publisherAgreement?.contractReference ?? null,
          state: row.state,
          basisMinor: row.basisMinor,
          amountMinor: row.amountMinor,
          currency: row.currency,
          payableAt: row.payableAt,
          paidAt: row.paidAt,
          reversedAt: row.reversedAt,
          reversedAllocationId: row.reversedAllocationId,
          settlementId: settlement?.id ?? null,
          paymentReference: settlement?.paymentReference ?? null,
          settlementPaidAt: settlement?.paidAt ?? null,
        };
      });
    }
    if (reportType === 'PUBLISHER_SETTLEMENTS') {
      const rows = await this.prisma.partnerSettlement.findMany({
        where: {
          ...(filters.partnerUserId
            ? { partnerUserId: filters.partnerUserId }
            : {}),
          ...dateFilter,
          lines: { some: { allocation: { kind: 'PUBLISHER_SALE' } } },
        },
        select: {
          id: true,
          createdAt: true,
          partnerUserId: true,
          paymentReference: true,
          currency: true,
          totalMinor: true,
          paidAt: true,
          lines: {
            where: { allocation: { kind: 'PUBLISHER_SALE' } },
            select: { allocation: { select: { amountMinor: true } } },
          },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        partnerUserId: row.partnerUserId,
        paymentReference: row.paymentReference,
        currency: row.currency,
        settlementTotalMinor: row.totalMinor,
        paidAt: row.paidAt,
        publisherAllocationCount: row.lines.length,
        publisherTotalMinor: row.lines.reduce(
          (sum, line) => sum + line.allocation.amountMinor,
          0,
        ),
      }));
    }
    if (reportType === 'REFERRAL_ALLOCATIONS')
      return this.prisma.partnerAllocation.findMany({
        where: {
          kind: 'REFERRAL_COMMISSION',
          ...(filters.partnerUserId
            ? { partnerUserId: filters.partnerUserId }
            : {}),
          ...dateFilter,
        },
        select: {
          createdAt: true,
          partnerUserId: true,
          state: true,
          basisMinor: true,
          amountMinor: true,
          currency: true,
          payableAt: true,
          paidAt: true,
          reversedAt: true,
        },
      });
    if (reportType === 'REFERRAL_SETTLEMENTS') {
      const rows = await this.prisma.partnerSettlement.findMany({
        where: {
          ...(filters.partnerUserId
            ? { partnerUserId: filters.partnerUserId }
            : {}),
          ...dateFilter,
          lines: { some: { allocation: { kind: 'REFERRAL_COMMISSION' } } },
        },
        select: {
          createdAt: true,
          partnerUserId: true,
          paymentReference: true,
          currency: true,
          paidAt: true,
          lines: {
            where: { allocation: { kind: 'REFERRAL_COMMISSION' } },
            select: { allocation: { select: { amountMinor: true } } },
          },
        },
      });
      return rows.map((row) => ({
        createdAt: row.createdAt,
        partnerUserId: row.partnerUserId,
        paymentReference: row.paymentReference,
        currency: row.currency,
        paidAt: row.paidAt,
        referralAllocationCount: row.lines.length,
        referralTotalMinor: row.lines.reduce(
          (sum, line) => sum + line.allocation.amountMinor,
          0,
        ),
      }));
    }
    return this.prisma.studentEntitlement.findMany({
      where: dateFilter,
      select: {
        createdAt: true,
        source: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
}
