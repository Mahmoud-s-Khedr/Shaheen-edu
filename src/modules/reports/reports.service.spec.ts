import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ReportDataClassification,
  ReportExportStatus,
  Role,
} from '../../common/types/roles.enum';
import { ReportsService } from './reports.service';

const actor = { id: 'admin-1', role: Role.ADMIN } as any;
const enabledConfig = {
  get: jest.fn().mockReturnValue({ reportExportsEnabled: true }),
} as any;

describe('ReportsService export lifecycle', () => {
  function build() {
    const prisma: any = {
      reportExportJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      partnerAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      partnerSettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const storage = {
      upload: jest.fn(),
      delete: jest.fn(),
      createProtectedUrl: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const queue = { enqueue: jest.fn() };
    return {
      prisma,
      storage,
      audit,
      queue,
      service: new ReportsService(
        prisma,
        audit as any,
        queue as any,
        storage as any,
        enabledConfig,
      ),
    };
  }

  it('uses a conditional update so a completed export cannot be cancelled afterwards', async () => {
    const { prisma, service } = build();
    prisma.reportExportJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestedById: actor.id,
      status: ReportExportStatus.COMPLETED,
    });
    prisma.reportExportJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel(actor, 'job-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.reportExportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [ReportExportStatus.QUEUED, ReportExportStatus.PROCESSING],
          },
        }),
      }),
    );
  });

  it('deletes an uploaded file when cancellation wins the completion race', async () => {
    const { prisma, storage, service } = build();
    prisma.reportExportJob.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.reportExportJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      reportType: 'COMMERCE',
      filters: {},
      columns: ['status'],
    });
    await service.generate('job-1');
    expect(storage.delete).toHaveBeenCalledWith('private/reports/job-1.csv');
    expect(storage.upload).toHaveBeenCalledWith(
      'private/reports/job-1.csv',
      expect.anything(),
      'text/csv; charset=utf-8',
      expect.objectContaining({
        classification: ReportDataClassification.NON_PII,
      }),
    );
  });

  it('deletes expired files and marks their jobs expired', async () => {
    const { prisma, storage, audit, service } = build();
    prisma.reportExportJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        storageKey: 'private/reports/job-1.csv',
        requestedById: actor.id,
        classification: ReportDataClassification.NON_PII,
      },
    ]);
    prisma.reportExportJob.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.expireCompletedExports(new Date())).resolves.toEqual({
      scanned: 1,
      cleaned: 1,
    });
    expect(storage.delete).toHaveBeenCalledWith('private/reports/job-1.csv');
    expect(prisma.reportExportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReportExportStatus.EXPIRED,
          storageKey: null,
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPORT_EXPORT_EXPIRED',
        actorUserId: actor.id,
        targetId: 'job-1',
      }),
    );
  });

  it('requires a reason and enforced column allowlist for privileged exports', async () => {
    const { prisma, queue, audit, service } = build();
    await expect(
      service.requestExport(actor, {
        reportType: 'COMMERCE',
        columns: ['status'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.requestExport(actor, {
        reportType: 'COMMERCE',
        columns: ['studentUserId'],
        reason: 'support',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.reportExportJob.create.mockResolvedValue({ id: 'job-1' });
    await service.requestExport(actor, {
      reportType: 'COMMERCE',
      columns: ['status'],
      reason: 'support',
    });
    expect(prisma.reportExportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          containsPii: false,
          classification: ReportDataClassification.NON_PII,
          reason: 'support',
        }),
      }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith('job-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPORT_EXPORT_REQUESTED',
        metadata: expect.objectContaining({
          classification: ReportDataClassification.NON_PII,
          reason: 'support',
        }),
      }),
    );
  });

  it('issues only a short-lived download URL and audits the download', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-23T12:00:00.000Z'));
    const { prisma, storage, audit, service } = build();
    const artifactExpiresAt = new Date('2026-08-23T13:00:00.000Z');
    prisma.reportExportJob.findUnique.mockResolvedValue({
      id: 'job-1',
      requestedById: actor.id,
      reportType: 'COMMERCE',
      classification: ReportDataClassification.NON_PII,
      status: ReportExportStatus.COMPLETED,
      storageKey: 'private/reports/job-1.csv',
      expiresAt: artifactExpiresAt,
    });
    storage.createProtectedUrl.mockReturnValue(
      'https://private.example/export',
    );
    const result = await service.download(actor, 'job-1');
    expect(result.expiresAt).toEqual(new Date('2026-08-23T12:15:00.000Z'));
    expect(storage.createProtectedUrl).toHaveBeenCalledWith(
      'private/reports/job-1.csv',
      result.expiresAt,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REPORT_EXPORT_DOWNLOADED',
        metadata: expect.objectContaining({
          classification: ReportDataClassification.NON_PII,
          urlExpiresAt: result.expiresAt.toISOString(),
        }),
      }),
    );
    jest.useRealTimers();
  });

  it('exports publisher allocation ledger rows with agreement and settlement references but no order data', async () => {
    const { prisma, service } = build();
    prisma.partnerAllocation.findMany.mockResolvedValue([
      {
        id: 'allocation-1',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        partnerUserId: 'publisher-1',
        publisherAgreementId: 'agreement-1',
        state: 'PAID',
        basisMinor: 10000,
        amountMinor: 2500,
        currency: 'EGP',
        payableAt: new Date('2026-08-01T00:00:00.000Z'),
        paidAt: new Date('2026-08-02T00:00:00.000Z'),
        reversedAt: null,
        reversedAllocationId: null,
        publisherAgreement: { version: 2, contractReference: 'PUB-2026-02' },
        settlementLines: [
          {
            settlement: {
              id: 'settlement-1',
              paymentReference: 'BANK-001',
              paidAt: new Date('2026-08-02T00:00:00.000Z'),
            },
          },
        ],
      },
    ]);

    const rows = await (service as any).rowsFor(
      'PUBLISHER_ALLOCATIONS',
      {},
      {},
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'allocation-1',
        agreementVersion: 2,
        contractReference: 'PUB-2026-02',
        settlementId: 'settlement-1',
        paymentReference: 'BANK-001',
      }),
    ]);
    expect(prisma.partnerAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: 'PUBLISHER_SALE' }),
        select: expect.not.objectContaining({ orderItem: expect.anything() }),
      }),
    );
    await expect(
      service.requestExport(actor, {
        reportType: 'PUBLISHER_ALLOCATIONS',
        columns: ['orderItemId'],
        reason: 'finance reconciliation',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exports publisher settlement totals from publisher ledger lines', async () => {
    const { prisma, service } = build();
    prisma.partnerSettlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        partnerUserId: 'publisher-1',
        paymentReference: 'BANK-001',
        currency: 'EGP',
        totalMinor: 3000,
        paidAt: new Date('2026-08-03T00:00:00.000Z'),
        lines: [{ allocation: { amountMinor: 2500 } }],
      },
    ]);

    const rows = await (service as any).rowsFor(
      'PUBLISHER_SETTLEMENTS',
      {},
      {},
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'settlement-1',
        settlementTotalMinor: 3000,
        publisherAllocationCount: 1,
        publisherTotalMinor: 2500,
      }),
    ]);
    expect(prisma.partnerSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lines: { some: { allocation: { kind: 'PUBLISHER_SALE' } } },
        }),
      }),
    );
  });
});
