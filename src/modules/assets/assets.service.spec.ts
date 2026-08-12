import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssetKind, AssetStatus, Role } from '../../common/types/roles.enum';
import { AssetsService } from './assets.service';

const admin = { id: 'admin-1', role: Role.ADMIN, sessionId: 's1' };
const student = { id: 'student-1', role: Role.STUDENT, sessionId: 's2' };
const config = { endpoint: 'https://s3.example.test', bucket: 'bucket', accessKeyId: 'key', secretAccessKey: 'secret', pullZoneUrl: 'https://cdn.example.test', tokenKey: 'token-key', urlTtlSeconds: 300, uploadTtlSeconds: 900, imageMaxBytes: 1024, documentMaxBytes: 2048, downloadMaxBytes: 4096 };
const pdf = Buffer.from('%PDF-1.7\n');

function build() {
  const prisma: any = { asset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() }, contentItem: { count: jest.fn() }, assetReference: { count: jest.fn() }, academicGrade: { count: jest.fn() }, subject: { count: jest.fn() }, course: { count: jest.fn() }, chapter: { count: jest.fn() }, lesson: { count: jest.fn() }, section: { count: jest.fn() }, questionAsset: { count: jest.fn() }, questionVideoLink: { count: jest.fn() }, $transaction: jest.fn() };
  const storage: any = { createUploadUrl: jest.fn().mockResolvedValue('https://bunny.example.test/signed'), inspect: jest.fn(), delete: jest.fn().mockResolvedValue(undefined), createProtectedUrl: jest.fn() };
  const audit: any = { record: jest.fn() };
  return { service: new AssetsService(prisma, audit, storage, { get: () => config } as any), prisma, storage, audit };
}

describe('AssetsService direct uploads', () => {
  it('authorizes only admins and validates the declared file', async () => {
    const { service, prisma, storage } = build();
    await expect(service.authorizeUpload(student, AssetKind.PDF, { filename: 'lesson.pdf', mimeType: 'application/pdf' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.authorizeUpload(admin, AssetKind.PDF, { filename: 'lesson.png', mimeType: 'application/pdf' })).rejects.toBeInstanceOf(BadRequestException);
    prisma.asset.create.mockResolvedValue({ id: 'asset-1', provider: 'BUNNY_STORAGE', kind: AssetKind.PDF, status: AssetStatus.UPLOADING, filename: 'lesson.pdf' });
    await expect(service.authorizeUpload(admin, AssetKind.PDF, { filename: 'lesson.pdf', mimeType: 'application/pdf' })).resolves.toMatchObject({ asset: { id: 'asset-1' }, upload: { method: 'PUT' } });
    expect(storage.createUploadUrl).toHaveBeenCalled();
  });

  it('marks an uploaded Bunny object ready after size, MIME, and magic validation', async () => {
    const { service, prisma, storage, audit } = build();
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', provider: 'BUNNY_STORAGE', kind: AssetKind.PDF, status: AssetStatus.UPLOADING, uploadedById: admin.id, storageKey: 'assets/pdf/a.pdf', mimeType: 'application/pdf' });
    storage.inspect.mockResolvedValue({ sizeBytes: pdf.length, mimeType: 'application/pdf', first: pdf });
    prisma.asset.update.mockResolvedValue({ id: 'asset-1', status: AssetStatus.READY });
    await expect(service.completeUpload(admin, 'asset-1')).resolves.toMatchObject({ id: 'asset-1', status: AssetStatus.READY });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSET_UPLOADED' }));
  });

  it('retries a transient Bunny 404 while a direct upload becomes visible', async () => {
    const { service, prisma, storage } = build();
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', provider: 'BUNNY_STORAGE', kind: AssetKind.PDF, status: AssetStatus.UPLOADING, uploadedById: admin.id, storageKey: 'assets/pdf/a.pdf', mimeType: 'application/pdf' });
    storage.inspect
      .mockRejectedValueOnce({ name: 'NotFound', $metadata: { httpStatusCode: 404 } })
      .mockResolvedValueOnce({ sizeBytes: pdf.length, mimeType: 'application/pdf', first: pdf });
    prisma.asset.update.mockResolvedValue({ id: 'asset-1', status: AssetStatus.READY });

    await expect(service.completeUpload(admin, 'asset-1')).resolves.toMatchObject({ id: 'asset-1', status: AssetStatus.READY });
    expect(storage.inspect).toHaveBeenCalledTimes(2);
  });

  it('fails and deletes an object that does not match its authorization', async () => {
    const { service, prisma, storage } = build();
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', provider: 'BUNNY_STORAGE', kind: AssetKind.PDF, status: AssetStatus.UPLOADING, uploadedById: admin.id, storageKey: 'assets/pdf/a.pdf', mimeType: 'application/pdf' });
    storage.inspect.mockResolvedValue({ sizeBytes: 8, mimeType: 'image/png', first: Buffer.from('not-a-pdf') });
    await expect(service.completeUpload(admin, 'asset-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.delete).toHaveBeenCalledWith('assets/pdf/a.pdf');
  });
});
