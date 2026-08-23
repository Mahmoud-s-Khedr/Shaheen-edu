import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ReportExportStatus, Role } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import { AuditService } from '../audit/audit.service';
import { ReportExportQueue } from './report-export.queue';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { REPORT_TYPES, type CreateReportExportDto, type PlatformReportQueryDto, type ReportExportsQueryDto, type ReportType } from './dto/reports.dto';

const ALLOWED_COLUMNS: Record<ReportType, readonly string[]> = {
  COMMERCE: ['createdAt', 'status', 'paymentChannel', 'subtotalMinor', 'discountMinor', 'totalMinor', 'currency'],
  PARTNER_OBLIGATIONS: ['createdAt', 'partnerUserId', 'kind', 'state', 'basisMinor', 'amountMinor', 'currency'],
  ENTITLEMENTS: ['createdAt', 'source', 'status', 'startsAt', 'expiresAt', 'revokedAt'],
};
@Injectable()
export class ReportsService {
  private readonly exportsEnabled: boolean;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly queue: ReportExportQueue, private readonly storage: BunnyStorageProvider, config?: ConfigService<AppConfig, true>) { this.exportsEnabled = (config?.get('features', { infer: true }) ?? { reportExportsEnabled: false }).reportExportsEnabled; }
  private admin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private dates(query: PlatformReportQueryDto) { const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined; const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined; if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf())) || (from && to && to < from)) throw new BadRequestException('Invalid date range'); return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }; }
  private escape(value: unknown) { const text = value instanceof Date ? value.toISOString() : String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
  async commerce(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor); const createdAt = this.dates(query);
    const rows = await this.prisma.order.groupBy({ by: ['status', 'paymentChannel', 'currency'], where: { ...(Object.keys(createdAt).length ? { createdAt } : {}) }, _count: true, _sum: { subtotalMinor: true, discountMinor: true, totalMinor: true } });
    return { data: rows.map((row) => ({ ...row, orders: row._count, subtotalMinor: row._sum.subtotalMinor ?? 0, discountMinor: row._sum.discountMinor ?? 0, totalMinor: row._sum.totalMinor ?? 0 })), retention: 'Financial aggregates and allocation records are retained for seven years.' };
  }
  async partnerObligations(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor); const createdAt = this.dates(query);
    const rows = await this.prisma.partnerAllocation.groupBy({ by: ['kind', 'state', 'currency'], where: { ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) }, _count: true, _sum: { amountMinor: true } });
    return { data: rows.map((row) => ({ ...row, allocations: row._count, amountMinor: row._sum.amountMinor ?? 0 })) };
  }
  async requestExport(actor: RequestUser, dto: CreateReportExportDto) {
    this.admin(actor); if (!this.exportsEnabled) throw new ConflictException('Report exports are disabled by rollout control'); if (!REPORT_TYPES.includes(dto.reportType)) throw new BadRequestException('Unsupported report type');
    const allowed = ALLOWED_COLUMNS[dto.reportType]; const columns = [...new Set(dto.columns)];
    if (!columns.length || columns.some((column) => !allowed.includes(column))) throw new BadRequestException('One or more selected columns are not allowed for this report');
    const filters = { ...(dto.from ? { from: dto.from } : {}), ...(dto.to ? { to: dto.to } : {}), ...(dto.partnerUserId ? { partnerUserId: dto.partnerUserId } : {}) };
    const job = await this.prisma.reportExportJob.create({ data: { requestedById: actor.id, reportType: dto.reportType, filters, columns, reason: dto.reason?.trim() || null, containsPii: false } });
    try { await this.queue.enqueue(job.id); } catch (error) { await this.prisma.reportExportJob.update({ where: { id: job.id }, data: { status: ReportExportStatus.FAILED, error: 'Export queue is unavailable' } }); throw new ConflictException('Export queue is unavailable'); }
    await this.audit.record({ actorUserId: actor.id, action: 'REPORT_EXPORT_REQUESTED', targetType: 'ReportExportJob', targetId: job.id, metadata: { reportType: dto.reportType, columns, ...(dto.reason?.trim() ? { reason: dto.reason.trim() } : {}) } });
    return job;
  }
  async exports(actor: RequestUser, query: ReportExportsQueryDto) { this.admin(actor); if (!this.exportsEnabled) throw new ConflictException('Report exports are disabled by rollout control'); const where = actor.role === Role.SUPER_ADMIN ? {} : { requestedById: actor.id }; const [data, total] = await this.prisma.$transaction([this.prisma.reportExportJob.findMany({ where, select: { id: true, reportType: true, status: true, rowCount: true, expiresAt: true, createdAt: true, cancelledAt: true, error: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.reportExportJob.count({ where })]); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
  async download(actor: RequestUser, id: string) { this.admin(actor); const job = await this.prisma.reportExportJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException('Export not found'); if (actor.role !== Role.SUPER_ADMIN && job.requestedById !== actor.id) throw new ForbiddenException('Export belongs to another administrator'); if (job.status !== ReportExportStatus.COMPLETED || !job.storageKey || !job.expiresAt || job.expiresAt <= new Date()) throw new ConflictException('Export is not available'); await this.prisma.reportExportJob.update({ where: { id }, data: { downloadedAt: new Date() } }); await this.audit.record({ actorUserId: actor.id, action: 'REPORT_EXPORT_DOWNLOADED', targetType: 'ReportExportJob', targetId: id }); return { url: this.storage.createProtectedUrl(job.storageKey, job.expiresAt), expiresAt: job.expiresAt }; }
  async cancel(actor: RequestUser, id: string) { this.admin(actor); const job = await this.prisma.reportExportJob.findUnique({ where: { id } }); if (!job) throw new NotFoundException('Export not found'); if (actor.role !== Role.SUPER_ADMIN && job.requestedById !== actor.id) throw new ForbiddenException('Export belongs to another administrator'); const cancelledAt = new Date(); const updated = await this.prisma.reportExportJob.updateMany({ where: { id, status: { in: [ReportExportStatus.QUEUED, ReportExportStatus.PROCESSING] } }, data: { status: ReportExportStatus.CANCELLED, cancelledAt } }); if (!updated.count) throw new ConflictException('Only queued or processing exports can be cancelled'); await this.audit.record({ actorUserId: actor.id, action: 'REPORT_EXPORT_CANCELLED', targetType: 'ReportExportJob', targetId: id }); return this.prisma.reportExportJob.findUniqueOrThrow({ where: { id } }); }
  async generate(jobId: string) {
    const claimed = await this.prisma.reportExportJob.updateMany({ where: { id: jobId, status: ReportExportStatus.QUEUED }, data: { status: ReportExportStatus.PROCESSING } }); if (!claimed.count) return;
    const job = await this.prisma.reportExportJob.findUniqueOrThrow({ where: { id: jobId } });
    try {
      const filters = job.filters as any; const columns = job.columns as string[]; const createdAt = this.dates(filters);
      let rows: Array<Record<string, unknown>>;
      if (job.reportType === 'COMMERCE') rows = await this.prisma.order.findMany({ where: { ...(Object.keys(createdAt).length ? { createdAt } : {}) }, select: { createdAt: true, status: true, paymentChannel: true, subtotalMinor: true, discountMinor: true, totalMinor: true, currency: true } });
      else if (job.reportType === 'PARTNER_OBLIGATIONS') rows = await this.prisma.partnerAllocation.findMany({ where: { ...(filters.partnerUserId ? { partnerUserId: filters.partnerUserId } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}) }, select: { createdAt: true, partnerUserId: true, kind: true, state: true, basisMinor: true, amountMinor: true, currency: true } });
      else rows = await this.prisma.studentEntitlement.findMany({ where: { ...(Object.keys(createdAt).length ? { createdAt } : {}) }, select: { createdAt: true, source: true, status: true, startsAt: true, expiresAt: true, revokedAt: true } });
      const key = `private/reports/${job.id}.csv`; const csv = `${columns.join(',')}\n${rows.map((row) => columns.map((column) => this.escape(row[column])).join(',')).join('\n')}\n`;
      await this.storage.upload(key, Readable.from([csv]), 'text/csv; charset=utf-8'); const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const completed = await this.prisma.reportExportJob.updateMany({ where: { id: job.id, status: ReportExportStatus.PROCESSING }, data: { status: ReportExportStatus.COMPLETED, storageKey: key, rowCount: rows.length, expiresAt } });
      if (!completed.count) await this.storage.delete(key);
    } catch (error: any) { await this.prisma.reportExportJob.updateMany({ where: { id: job.id, status: ReportExportStatus.PROCESSING }, data: { status: ReportExportStatus.FAILED, error: String(error?.message ?? 'Export generation failed').slice(0, 1000) } }); throw error; }
  }
  async expireCompletedExports(now = new Date()) {
    const expired = await this.prisma.reportExportJob.findMany({ where: { status: ReportExportStatus.COMPLETED, expiresAt: { lte: now }, storageKey: { not: null } }, select: { id: true, storageKey: true } });
    let cleaned = 0;
    for (const job of expired) {
      await this.storage.delete(job.storageKey!);
      const updated = await this.prisma.reportExportJob.updateMany({ where: { id: job.id, status: ReportExportStatus.COMPLETED, expiresAt: { lte: now } }, data: { status: ReportExportStatus.EXPIRED, storageKey: null } });
      cleaned += updated.count;
    }
    return { scanned: expired.length, cleaned };
  }
}
