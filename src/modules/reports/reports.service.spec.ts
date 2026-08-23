import { ConflictException } from '@nestjs/common';
import { ReportExportStatus, Role } from '../../common/types/roles.enum';
import { ReportsService } from './reports.service';

const actor = { id: 'admin-1', role: Role.ADMIN } as any;
const enabledConfig = { get: jest.fn().mockReturnValue({ reportExportsEnabled: true }) } as any;

describe('ReportsService export lifecycle', () => {
  function build() {
    const prisma: any = {
      reportExportJob: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const storage = { upload: jest.fn(), delete: jest.fn() };
    return { prisma, storage, service: new ReportsService(prisma, { record: jest.fn() } as any, {} as any, storage as any, enabledConfig) };
  }

  it('uses a conditional update so a completed export cannot be cancelled afterwards', async () => {
    const { prisma, service } = build();
    prisma.reportExportJob.findUnique.mockResolvedValue({ id: 'job-1', requestedById: actor.id, status: ReportExportStatus.COMPLETED });
    prisma.reportExportJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.cancel(actor, 'job-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.reportExportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: [ReportExportStatus.QUEUED, ReportExportStatus.PROCESSING] } }) }));
  });

  it('deletes an uploaded file when cancellation wins the completion race', async () => {
    const { prisma, storage, service } = build();
    prisma.reportExportJob.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.reportExportJob.findUniqueOrThrow.mockResolvedValue({ id: 'job-1', reportType: 'COMMERCE', filters: {}, columns: ['status'] });
    await service.generate('job-1');
    expect(storage.delete).toHaveBeenCalledWith('private/reports/job-1.csv');
  });

  it('deletes expired files and marks their jobs expired', async () => {
    const { prisma, storage, service } = build();
    prisma.reportExportJob.findMany.mockResolvedValue([{ id: 'job-1', storageKey: 'private/reports/job-1.csv' }]);
    prisma.reportExportJob.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.expireCompletedExports(new Date())).resolves.toEqual({ scanned: 1, cleaned: 1 });
    expect(storage.delete).toHaveBeenCalledWith('private/reports/job-1.csv');
    expect(prisma.reportExportJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ReportExportStatus.EXPIRED, storageKey: null }) }));
  });
});
