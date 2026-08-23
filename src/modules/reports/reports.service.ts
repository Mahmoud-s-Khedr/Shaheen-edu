import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
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

const CAIRO = 'Africa/Cairo';
const MAX_EXPORT_ROWS = 100_000;
const FILTER_KEYS = [
  'from', 'to', 'subjectId', 'courseId', 'chapterId', 'gradeId',
  'governorateId', 'centerId', 'paymentChannel', 'orderStatus',
  'paymentStatus', 'promotionId', 'couponCode', 'referralCode', 'partnerUserId',
] as const;

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
  PLATFORM_REVENUE: {
    classification: ReportDataClassification.NON_PII,
    columns: ['approvedAt', 'status', 'paymentChannel', 'subtotalMinor', 'discountMinor', 'totalMinor', 'currency'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: true,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
  },
  REFUNDS: {
    classification: ReportDataClassification.NON_PII,
    columns: ['requestedAt', 'reviewedAt', 'status', 'amountMinor', 'currency'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: true,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
  },
  PAYMENTS: {
    classification: ReportDataClassification.NON_PII,
    columns: ['initiatedAt', 'completedAt', 'channel', 'status'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: true,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
  },
  REGISTRATIONS: {
    classification: ReportDataClassification.NON_PII,
    columns: ['createdAt', 'academicGradeId', 'governorateId', 'centerId'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: false,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
  },
  ACTIVE_PURCHASERS: {
    classification: ReportDataClassification.NON_PII,
    columns: ['approvedPurchasers', 'purchasersWithCurrentAccess'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: true,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
  },
  ENTITLEMENT_LIFECYCLE: {
    classification: ReportDataClassification.NON_PII,
    columns: ['createdAt', 'source', 'status', 'startsAt', 'expiresAt', 'revokedAt'],
    roles: [Role.ADMIN, Role.SUPER_ADMIN], privileged: false,
    retentionMs: 24 * 60 * 60 * 1000, signedUrlMs: 15 * 60 * 1000,
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
      ? DateTime.fromISO(query.from, { zone: CAIRO }).startOf('day')
      : undefined;
    const to = query.to
      ? DateTime.fromISO(query.to, { zone: CAIRO }).plus({ days: 1 }).startOf('day')
      : undefined;
    if ((from && !from.isValid) || (to && !to.isValid) || (from && to && to <= from))
      throw new BadRequestException('Invalid Cairo date range');
    return {
      ...(from ? { gte: from.toUTC().toJSDate() } : {}),
      ...(to ? { lt: to.toUTC().toJSDate() } : {}),
    };
  }

  private normalizedFilters(query: PlatformReportQueryDto) {
    return {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.gradeId ? { gradeId: query.gradeId } : {}),
      ...(query.governorateId ? { governorateId: query.governorateId } : {}),
      ...(query.centerId ? { centerId: query.centerId } : {}),
      ...(query.paymentChannel ? { paymentChannel: query.paymentChannel } : {}),
      ...(query.orderStatus ? { orderStatus: query.orderStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.promotionId ? { promotionId: query.promotionId } : {}),
      ...(query.couponCode ? { couponCode: query.couponCode.trim().toUpperCase() } : {}),
      ...(query.referralCode ? { referralCode: query.referralCode.trim().toUpperCase() } : {}),
      ...(query.partnerUserId ? { partnerUserId: query.partnerUserId } : {}),
    };
  }

  private assertSupportedFilters(query: PlatformReportQueryDto, supported: readonly string[]) {
    const unsupported = FILTER_KEYS.filter(
      (key) => (query as any)[key] !== undefined && !supported.includes(key),
    );
    if (unsupported.length)
      throw new BadRequestException(
        `Unsupported filters for this report: ${unsupported.join(', ')}`,
      );
  }

  private assertReportFilters(reportType: string, query: PlatformReportQueryDto) {
    const orderFilters = FILTER_KEYS;
    const studentFilters = ['from', 'to', 'subjectId', 'courseId', 'chapterId', 'gradeId', 'governorateId', 'centerId'] as const;
    const ledgerFilters = ['from', 'to', 'partnerUserId'] as const;
    if (['COMMERCE', 'PLATFORM_REVENUE', 'REFUNDS', 'PAYMENTS', 'ACTIVE_PURCHASERS'].includes(reportType))
      return this.assertSupportedFilters(query, orderFilters);
    if (['REGISTRATIONS', 'ENTITLEMENT_LIFECYCLE', 'ENTITLEMENTS'].includes(reportType))
      return this.assertSupportedFilters(query, studentFilters);
    return this.assertSupportedFilters(query, ledgerFilters);
  }

  private studentWhere(query: PlatformReportQueryDto) {
    return {
      ...(query.gradeId ? { academicGradeId: query.gradeId } : {}),
      ...(query.governorateId ? { governorateId: query.governorateId } : {}),
      ...(query.centerId ? { centerId: query.centerId } : {}),
    };
  }

  private itemWhere(query: PlatformReportQueryDto) {
    const predicates: any[] = [];
    if (query.chapterId) predicates.push({ chapterId: query.chapterId });
    if (query.courseId)
      predicates.push({ OR: [{ courseId: query.courseId }, { chapter: { courseId: query.courseId } }] });
    if (query.subjectId)
      predicates.push({ OR: [{ course: { subjectId: query.subjectId } }, { chapter: { course: { subjectId: query.subjectId } } }] });
    if (query.promotionId)
      predicates.push({ appliedPromotionSnapshot: { path: ['campaignId'], equals: query.promotionId } });
    return predicates.length ? { AND: predicates } : undefined;
  }

  private entitlementWhere(query: PlatformReportQueryDto, dates: any, dateField = 'createdAt') {
    const predicates: any[] = [];
    if (query.chapterId) predicates.push({ chapterId: query.chapterId });
    if (query.courseId)
      predicates.push({ OR: [{ courseId: query.courseId }, { chapter: { courseId: query.courseId } }] });
    if (query.subjectId)
      predicates.push({ OR: [{ course: { subjectId: query.subjectId } }, { chapter: { course: { subjectId: query.subjectId } } }] });
    return {
      ...(Object.keys(dates).length ? { [dateField]: dates } : {}),
      ...(Object.keys(this.studentWhere(query)).length ? { student: this.studentWhere(query) } : {}),
      ...(predicates.length ? { AND: predicates } : {}),
    } as any;
  }

  private orderWhere(query: PlatformReportQueryDto, dateField: string, dates: any) {
    const items = this.itemWhere(query);
    return {
      ...(Object.keys(dates).length ? { [dateField]: dates } : {}),
      ...(query.paymentChannel ? { paymentChannel: query.paymentChannel } : {}),
      ...(query.orderStatus ? { status: query.orderStatus } : {}),
      ...(query.paymentStatus ? { paymentAttempts: { some: { status: query.paymentStatus } } } : {}),
      ...(Object.keys(this.studentWhere(query)).length ? { student: this.studentWhere(query) } : {}),
      ...(items ? { items: { some: items } } : {}),
      ...(query.couponCode ? { couponReservation: { coupon: { code: query.couponCode.trim().toUpperCase() } } } : {}),
      ...(query.referralCode ? { referralAttribution: { referralCode: { code: query.referralCode.trim().toUpperCase() } } } : {}),
      ...(query.partnerUserId ? { referralAttribution: { referralProgram: { partnerUserId: query.partnerUserId } } } : {}),
    } as any;
  }

  private contract(name: string, metricDefinitions: Record<string, string>, filters: PlatformReportQueryDto) {
    return {
      report: name,
      period: { ...this.normalizedFilters(filters), timeZone: CAIRO },
      metricDefinitions,
      emptyResultBehavior: 'Returns data: [] and zero-valued totals; it never substitutes a prior period.',
      pagination: 'Aggregate endpoints are not paginated. Their group dimensions are fixed and bounded; source-record CSV exports are capped at 100,000 rows.',
      rollup: 'No derived rollup is used. Results are reproducible from the referenced source records at request time.',
    };
  }

  private async auditReportView(actor: RequestUser, reportType: string, query: PlatformReportQueryDto) {
    await this.audit.record({
      actorUserId: actor.id,
      action: 'PLATFORM_REPORT_VIEWED',
      targetType: 'PlatformReport',
      targetId: reportType,
      metadata: { reportType, filters: this.normalizedFilters(query) },
    });
  }

  private escape(value: unknown) {
    const text =
      value instanceof Date ? value.toISOString() : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  async commerce(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('PLATFORM_REVENUE', query);
    await this.auditReportView(actor, 'PLATFORM_REVENUE', query);
    const approvedAt = this.dates(query);
    const rows = await this.prisma.order.groupBy({
      by: ['status', 'paymentChannel', 'currency'],
      where: this.orderWhere(query, 'approvedAt', approvedAt),
      _count: true,
      _sum: { subtotalMinor: true, discountMinor: true, totalMinor: true },
    });
    return {
      ...this.contract('PLATFORM_REVENUE', {
        orders: 'Orders grouped by current order status and selected payment channel; date filtering uses approvedAt.',
        subtotalMinor: 'Sum of immutable order subtotal snapshots in EGP minor units.',
        discountMinor: 'Sum of immutable order discount snapshots in EGP minor units.',
        totalMinor: 'Sum of immutable order total snapshots in EGP minor units. Approved rows are recognized revenue.',
      }, query),
      data: rows.map((row) => ({
        ...row,
        orders: row._count,
        subtotalMinor: row._sum.subtotalMinor ?? 0,
        discountMinor: row._sum.discountMinor ?? 0,
        totalMinor: row._sum.totalMinor ?? 0,
      })),
      retention: 'Financial source records are retained for seven years.',
    };
  }

  async refunds(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('REFUNDS', query);
    await this.auditReportView(actor, 'REFUNDS', query);
    const requestedAt = this.dates(query);
    const order = this.orderWhere(query, 'createdAt', {});
    const rows = await this.prisma.refundRequest.groupBy({
      by: ['status'],
      where: {
        ...(Object.keys(requestedAt).length ? { requestedAt } : {}),
        order,
        ...(Object.keys(this.studentWhere(query)).length ? { student: this.studentWhere(query) } : {}),
      } as any,
      _count: true,
    });
    const approved = await this.prisma.refundRequestItem.groupBy({
      by: ['currency'],
      where: {
        refundRequest: {
          status: 'APPROVED',
          ...(Object.keys(requestedAt).length ? { requestedAt } : {}),
          order,
        },
      } as any,
      _count: true,
      _sum: { amountMinor: true },
    });
    return {
      ...this.contract('REFUNDS', {
        requests: 'Refund requests created in the selected Cairo period, grouped by current request status.',
        approvedAmountMinor: 'Sum of complete order-item reimbursement amounts for approved requests; no fractional item refunds exist.',
      }, query),
      data: rows.map((row) => ({ status: row.status, requests: row._count })),
      approvedAmounts: approved.map((row) => ({ currency: row.currency, refundedItems: row._count, approvedAmountMinor: row._sum.amountMinor ?? 0 })),
    };
  }

  async payments(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('PAYMENTS', query);
    await this.auditReportView(actor, 'PAYMENTS', query);
    const initiatedAt = this.dates(query);
    const order = this.orderWhere(query, 'createdAt', {});
    const rows = await this.prisma.paymentAttempt.groupBy({
      by: ['channel', 'status'],
      where: {
        ...(Object.keys(initiatedAt).length ? { initiatedAt } : {}),
        ...(query.paymentChannel ? { channel: query.paymentChannel } : {}),
        ...(query.paymentStatus ? { status: query.paymentStatus } : {}),
        order,
      } as any,
      _count: true,
    });
    return {
      ...this.contract('PAYMENTS', {
        attempts: 'Payment attempts initiated in the selected Cairo period, grouped by channel and current provider/manual status.',
        status: 'The latest persisted payment-attempt status; an order can have retry attempts.',
      }, query),
      data: rows.map((row) => ({ channel: row.channel, status: row.status, attempts: row._count })),
    };
  }

  async registrations(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('REGISTRATIONS', query);
    await this.auditReportView(actor, 'REGISTRATIONS', query);
    const createdAt = this.dates(query);
    const rows = await this.prisma.studentProfile.groupBy({
      by: ['academicGradeId', 'governorateId', 'centerId'],
      where: {
        ...(Object.keys(createdAt).length ? { createdAt } : {}),
        ...this.studentWhere(query),
      },
      _count: true,
    });
    return {
      ...this.contract('REGISTRATIONS', {
        registrations: 'Student profile records created in the selected Cairo period, grouped by their current grade and managed geography IDs.',
      }, query),
      data: rows.map((row) => ({ ...row, registrations: row._count })),
    };
  }

  async activePurchasers(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('ACTIVE_PURCHASERS', query);
    await this.auditReportView(actor, 'ACTIVE_PURCHASERS', query);
    const data = await this.activePurchaserSummary(query);
    return {
      ...this.contract('ACTIVE_PURCHASERS', {
        approvedPurchasers: 'Distinct students with an approved order in the selected Cairo period.',
        purchasersWithCurrentAccess: 'Approved purchasers from the selected period who have one or more effective, non-expired active entitlements at report time.',
      }, query),
      data: [data],
    };
  }

  private async activePurchaserSummary(query: PlatformReportQueryDto) {
    const approvedAt = this.dates(query);
    const now = new Date();
    const order = this.orderWhere(query, 'approvedAt', approvedAt);
    const rows = await this.prisma.order.findMany({
      where: { ...order, status: 'APPROVED' },
      select: { studentUserId: true },
      distinct: ['studentUserId'],
    });
    const active = await this.prisma.studentEntitlement.findMany({
      where: {
        studentUserId: { in: rows.map((row) => row.studentUserId) },
        status: 'ACTIVE',
        startsAt: { lte: now },
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: { studentUserId: true },
      distinct: ['studentUserId'],
    });
    return { approvedPurchasers: rows.length, purchasersWithCurrentAccess: active.length };
  }

  async entitlementLifecycle(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('ENTITLEMENT_LIFECYCLE', query);
    await this.auditReportView(actor, 'ENTITLEMENT_LIFECYCLE', query);
    const range = this.dates(query);
    const [grants, revocations, expiries, currentActive] = await Promise.all([
      this.prisma.studentEntitlement.groupBy({ by: ['source'], where: this.entitlementWhere(query, range), _count: true }),
      this.prisma.studentEntitlement.count({ where: { ...this.entitlementWhere(query, range, 'revokedAt'), revokedAt: { not: null, ...range } } }),
      this.prisma.studentEntitlement.count({ where: { ...this.entitlementWhere(query, range, 'expiresAt'), expiresAt: { not: null, ...range } } }),
      this.prisma.studentEntitlement.count({ where: { ...this.entitlementWhere(query, {}), status: 'ACTIVE', startsAt: { lte: new Date() }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] } }),
    ]);
    return {
      ...this.contract('ENTITLEMENT_LIFECYCLE', {
        grants: 'Entitlement rows created in the selected Cairo period, grouped by source.',
        revocations: 'Entitlement rows whose revokedAt falls in the selected Cairo period.',
        expiries: 'Entitlement rows whose expiresAt falls in the selected Cairo period. Expiry is access-time derived, not a mutable state transition.',
        currentActive: 'Effective active entitlement rows at report time, independent of the selected period.',
      }, query),
      data: { grants: grants.map((row) => ({ source: row.source, grants: row._count })), revocations, expiries, currentActive },
    };
  }

  async partnerObligations(actor: RequestUser, query: PlatformReportQueryDto) {
    this.admin(actor);
    this.assertReportFilters('PARTNER_OBLIGATIONS', query);
    await this.auditReportView(actor, 'PARTNER_OBLIGATIONS', query);
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
    this.assertReportFilters(dto.reportType, dto);
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
    // Store one canonical, trimmed representation so queue retries reproduce
    // exactly the requested report rather than reinterpreting user input.
    const filters = this.normalizedFilters(dto);
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
      if (rows.length > MAX_EXPORT_ROWS)
        throw new BadRequestException(
          `Export exceeds the ${MAX_EXPORT_ROWS.toLocaleString()} row limit; narrow the filters`,
        );
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
    createdAt: { gte?: Date; lt?: Date },
  ): Promise<Array<Record<string, unknown>>> {
    const dateFilter = Object.keys(createdAt).length ? { createdAt } : {};
    if (reportType === 'PLATFORM_REVENUE')
      return this.prisma.order.findMany({
        where: this.orderWhere(filters, 'approvedAt', createdAt),
        take: MAX_EXPORT_ROWS + 1,
        select: { approvedAt: true, status: true, paymentChannel: true, subtotalMinor: true, discountMinor: true, totalMinor: true, currency: true },
      });
    if (reportType === 'REFUNDS') {
      const rows = await this.prisma.refundRequest.findMany({
        where: {
          ...(Object.keys(createdAt).length ? { requestedAt: createdAt } : {}),
          order: this.orderWhere(filters, 'createdAt', {}),
          ...(Object.keys(this.studentWhere(filters)).length ? { student: this.studentWhere(filters) } : {}),
        } as any,
        take: MAX_EXPORT_ROWS + 1,
        select: { requestedAt: true, reviewedAt: true, status: true, items: { select: { amountMinor: true, currency: true } } },
      });
      return rows.flatMap((row) => row.items.map((item) => ({ requestedAt: row.requestedAt, reviewedAt: row.reviewedAt, status: row.status, amountMinor: item.amountMinor, currency: item.currency })));
    }
    if (reportType === 'PAYMENTS')
      return this.prisma.paymentAttempt.findMany({
        where: {
          ...(Object.keys(createdAt).length ? { initiatedAt: createdAt } : {}),
          ...(filters.paymentChannel ? { channel: filters.paymentChannel } : {}),
          ...(filters.paymentStatus ? { status: filters.paymentStatus } : {}),
          order: this.orderWhere(filters, 'createdAt', {}),
        } as any,
        take: MAX_EXPORT_ROWS + 1,
        select: { initiatedAt: true, completedAt: true, channel: true, status: true },
      });
    if (reportType === 'REGISTRATIONS')
      return this.prisma.studentProfile.findMany({
        where: { ...dateFilter, ...this.studentWhere(filters) },
        take: MAX_EXPORT_ROWS + 1,
        select: { createdAt: true, academicGradeId: true, governorateId: true, centerId: true },
      });
    if (reportType === 'ACTIVE_PURCHASERS') {
      return [await this.activePurchaserSummary(filters)];
    }
    if (reportType === 'ENTITLEMENT_LIFECYCLE')
      return this.prisma.studentEntitlement.findMany({
        where: this.entitlementWhere(filters, createdAt),
        take: MAX_EXPORT_ROWS + 1,
        select: { createdAt: true, source: true, status: true, startsAt: true, expiresAt: true, revokedAt: true },
      });
    if (reportType === 'COMMERCE')
      return this.prisma.order.findMany({
        where: this.orderWhere(filters, 'createdAt', createdAt),
        take: MAX_EXPORT_ROWS + 1,
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
        take: MAX_EXPORT_ROWS + 1,
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
        take: MAX_EXPORT_ROWS + 1,
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
        take: MAX_EXPORT_ROWS + 1,
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
        take: MAX_EXPORT_ROWS + 1,
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
        take: MAX_EXPORT_ROWS + 1,
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
      take: MAX_EXPORT_ROWS + 1,
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
