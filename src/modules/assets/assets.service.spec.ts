/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest mock plumbing is untyped by design */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  AssetKind,
  AssetStatus,
  ContentItemType,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { AssetsService } from './assets.service';

const admin: RequestUser = { id: 'admin-1', role: Role.ADMIN, sessionId: 's1' };
const student: RequestUser = {
  id: 'stu-1',
  role: Role.STUDENT,
  sessionId: 's2',
};

const storageConfig = {
  endpoint: 'https://s3.example.test',
  bucket: 'bucket',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  pullZoneUrl: 'https://cdn.example.test',
  tokenKey: 'token-key',
  urlTtlSeconds: 300,
  imageMaxBytes: 1024,
  documentMaxBytes: 2048,
  downloadMaxBytes: 4096,
};

const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PDF_HEADER = Buffer.from('%PDF-1.7\n');

function buildService() {
  const prisma = {
    asset: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    contentItem: { count: jest.fn() },
    assetReference: { count: jest.fn() },
    academicGrade: { count: jest.fn() },
    subject: { count: jest.fn() },
    course: { count: jest.fn() },
    chapter: { count: jest.fn() },
    lesson: { count: jest.fn() },
    section: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    createProtectedUrl: jest
      .fn()
      .mockImplementation(
        (key: string, expiresAt: Date) =>
          `https://cdn.example.test/${key}?token=abc&expires=${Math.floor(
            expiresAt.getTime() / 1000,
          )}`,
      ),
  };
  const config = { get: () => storageConfig };
  const service = new AssetsService(
    prisma as never,
    audit as never,
    storage as never,
    config as never,
  );
  return { service, prisma, audit, storage };
}

function part(buffer: Buffer, filename: string, mimetype: string) {
  return { file: Readable.from([buffer]), filename, mimetype };
}

describe('AssetsService', () => {
  describe('authorization', () => {
    it('rejects non-admin actors', async () => {
      const { service } = buildService();
      await expect(
        service.upload(
          student,
          AssetKind.PDF,
          part(PDF_HEADER, 'a.pdf', 'application/pdf'),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('upload validation', () => {
    it('rejects the VIDEO kind (handled by the video endpoint)', async () => {
      const { service } = buildService();
      await expect(
        service.upload(
          admin,
          AssetKind.VIDEO,
          part(PDF_HEADER, 'v.mp4', 'video/mp4'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unsupported MIME type for the asset kind', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.upload(
          admin,
          AssetKind.PDF,
          part(PDF_HEADER, 'a.pdf', 'image/png'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('rejects an empty payload and records the asset as FAILED', async () => {
      const { service, prisma, storage } = buildService();
      prisma.asset.create.mockResolvedValue({ id: 'a1' });
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.FAILED,
      });
      await expect(
        service.upload(admin, AssetKind.PDF, {
          file: Readable.from([]),
          filename: 'empty.pdf',
          mimetype: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AssetStatus.FAILED }),
        }),
      );
      expect(storage.delete).toHaveBeenCalled();
    });

    it('rejects a payload larger than the configured limit', async () => {
      const { service, prisma } = buildService();
      prisma.asset.create.mockResolvedValue({ id: 'a1' });
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.FAILED,
      });
      const oversized = Buffer.concat([
        PNG_HEADER,
        Buffer.alloc(storageConfig.imageMaxBytes + 10),
      ]);
      await expect(
        service.upload(
          admin,
          AssetKind.IMAGE,
          part(oversized, 'big.png', 'image/png'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file whose magic bytes do not match the declared MIME', async () => {
      const { service, prisma } = buildService();
      prisma.asset.create.mockResolvedValue({ id: 'a1' });
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.FAILED,
      });
      const notPng = Buffer.from('this is not a png at all');
      await expect(
        service.upload(
          admin,
          AssetKind.IMAGE,
          part(notPng, 'fake.png', 'image/png'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('assertMagic', () => {
    const docxMime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

    it('accepts matching signatures', () => {
      const { service } = buildService();
      const magic = (kind: AssetKind, mime: string, buf: Buffer) =>
        (service as any).assertMagic(kind, mime, buf);
      expect(() =>
        magic(AssetKind.IMAGE, 'image/png', PNG_HEADER),
      ).not.toThrow();
      expect(() =>
        magic(AssetKind.PDF, 'application/pdf', PDF_HEADER),
      ).not.toThrow();
      expect(() =>
        magic(AssetKind.IMAGE, 'image/png', Buffer.from('nope')),
      ).toThrow(BadRequestException);
    });

    it('validates the ZIP signature for OOXML documents', () => {
      const { service } = buildService();
      const magic = (kind: AssetKind, mime: string, buf: Buffer) =>
        (service as any).assertMagic(kind, mime, buf);
      // A well-formed docx is a ZIP container (PK\x03\x04).
      expect(() =>
        magic(AssetKind.DOCUMENT, docxMime, ZIP_HEADER),
      ).not.toThrow();
      // A docx MIME with a bogus header is now rejected (previously an unenforced gap).
      expect(() =>
        magic(AssetKind.DOCUMENT, docxMime, Buffer.from('anything')),
      ).toThrow(BadRequestException);
    });

    it('accepts text/csv and text/plain without a signature', () => {
      const { service } = buildService();
      const magic = (kind: AssetKind, mime: string, buf: Buffer) =>
        (service as any).assertMagic(kind, mime, buf);
      expect(() =>
        magic(AssetKind.DOWNLOADABLE_FILE, 'text/csv', Buffer.from('a,b,c')),
      ).not.toThrow();
      expect(() =>
        magic(AssetKind.DOWNLOADABLE_FILE, 'text/plain', Buffer.from('hello')),
      ).not.toThrow();
    });
  });

  describe('assertExtension', () => {
    it('rejects an extension that does not match the declared MIME', () => {
      const { service } = buildService();
      const assertExtension = (mime: string, name: string) =>
        (service as any).assertExtension(mime, name);
      expect(() => assertExtension('application/pdf', 'doc.pdf')).not.toThrow();
      expect(() => assertExtension('image/png', 'image.png')).not.toThrow();
      // Wrong extension for the declared MIME.
      expect(() => assertExtension('application/pdf', 'doc.txt')).toThrow(
        BadRequestException,
      );
      // Missing extension entirely.
      expect(() => assertExtension('image/png', 'image')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('filename sanitization', () => {
    it('strips unsafe characters and collapses separators', () => {
      const { service } = buildService();
      const filename = (name: string) => (service as any).filename(name);
      expect(filename('my file (1).pdf')).toBe('my_file_1_.pdf');
      expect(filename('../../etc/passwd')).toBe('.._.._etc_passwd');
    });

    it('rejects filenames that sanitize to empty or dot segments', () => {
      const { service } = buildService();
      const filename = (name: string) => (service as any).filename(name);
      expect(() => filename('')).toThrow(BadRequestException);
      expect(() => filename('.')).toThrow(BadRequestException);
      expect(() => filename('..')).toThrow(BadRequestException);
    });
  });

  describe('happy path', () => {
    it('streams to storage, marks READY, audits, and returns a summary without secrets', async () => {
      const { service, prisma, audit } = buildService();
      prisma.asset.create.mockResolvedValue({ id: 'a1' });
      const ready = {
        id: 'a1',
        provider: 'BUNNY_STORAGE',
        kind: AssetKind.PDF,
        status: AssetStatus.READY,
        filename: 'doc.pdf',
        storageKey: 'assets/pdf/uuid-doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: PDF_HEADER.length,
        checksum: 'deadbeef',
        createdAt: new Date(),
        readyAt: new Date(),
      };
      prisma.asset.update.mockResolvedValue(ready);

      const result = await service.upload(
        admin,
        AssetKind.PDF,
        part(PDF_HEADER, 'doc.pdf', 'application/pdf'),
      );

      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssetStatus.READY,
            sizeBytes: PDF_HEADER.length,
            checksum: expect.any(String),
          }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ASSET_UPLOADED' }),
      );
      expect(result).not.toHaveProperty('storageKey');
      expect(result).toMatchObject({ id: 'a1', status: AssetStatus.READY });
    });
  });

  describe('provider failure', () => {
    it('records FAILED, best-effort deletes, and rethrows', async () => {
      const { service, prisma, storage } = buildService();
      prisma.asset.create.mockResolvedValue({ id: 'a1' });
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.FAILED,
      });
      storage.upload.mockRejectedValue(new Error('bunny down'));

      await expect(
        service.upload(
          admin,
          AssetKind.PDF,
          part(PDF_HEADER, 'doc.pdf', 'application/pdf'),
        ),
      ).rejects.toThrow('bunny down');
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssetStatus.FAILED,
            metadata: { error: 'upload_failed' },
          }),
        }),
      );
      expect(storage.delete).toHaveBeenCalled();
    });
  });

  describe('archive / reference protection', () => {
    it('refuses to archive a referenced asset', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', storageKey: 'k' });
      prisma.$transaction.mockResolvedValue([1, 0, 0, 0, 0, 0, 0, 0]);
      await expect(service.archive(admin, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('archives an unreferenced asset, deletes bytes, and audits', async () => {
      const { service, prisma, storage, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({ id: 'a1', storageKey: 'k' });
      prisma.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.ARCHIVED,
      });
      await service.archive(admin, 'a1');
      expect(storage.delete).toHaveBeenCalledWith('k');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ASSET_ARCHIVED' }),
      );
    });
  });

  describe('delete', () => {
    it('deletes an unreferenced storage asset, removes bytes, and audits', async () => {
      const { service, prisma, storage, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        storageKey: 'k',
        video: null,
      });
      prisma.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.asset.delete.mockResolvedValue({ id: 'a1' });
      await expect(service.delete(admin, 'a1')).resolves.toEqual({
        id: 'a1',
        deleted: true,
      });
      expect(storage.delete).toHaveBeenCalledWith('k');
      expect(prisma.asset.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ASSET_DELETED' }),
      );
    });

    it('refuses to delete a referenced asset', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        storageKey: 'k',
        video: null,
      });
      prisma.$transaction.mockResolvedValue([1, 0, 0, 0, 0, 0, 0, 0]);
      await expect(service.delete(admin, 'a1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.asset.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a video-backed asset', async () => {
      const { service, prisma } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        storageKey: null,
        video: { assetId: 'a1' },
      });
      await expect(service.delete(admin, 'a1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.asset.delete).not.toHaveBeenCalled();
    });
  });

  describe('archiveIfUnreferenced', () => {
    it('archives a displaced asset once it is unreferenced', async () => {
      const { service, prisma, storage, audit } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.READY,
        storageKey: 'k',
      });
      prisma.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, 0, 0]);
      prisma.asset.update.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.ARCHIVED,
      });
      await service.archiveIfUnreferenced(admin, 'a1');
      expect(storage.delete).toHaveBeenCalledWith('k');
      expect(prisma.asset.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AssetStatus.ARCHIVED }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ASSET_REPLACED' }),
      );
    });

    it('does nothing when the asset is still referenced', async () => {
      const { service, prisma, storage } = buildService();
      prisma.asset.findUnique.mockResolvedValue({
        id: 'a1',
        status: AssetStatus.READY,
        storageKey: 'k',
      });
      prisma.$transaction.mockResolvedValue([1, 0, 0, 0, 0, 0, 0, 0]);
      await service.archiveIfUnreferenced(admin, 'a1');
      expect(storage.delete).not.toHaveBeenCalled();
      expect(prisma.asset.update).not.toHaveBeenCalled();
    });
  });

  describe('assertCompatible', () => {
    it('rejects an asset kind that does not match the content type', () => {
      const { service } = buildService();
      expect(() =>
        service.assertCompatible(
          { kind: AssetKind.IMAGE },
          ContentItemType.PDF,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.assertCompatible({ kind: AssetKind.PDF }, ContentItemType.PDF),
      ).not.toThrow();
      // TEXT/EXTERNAL_LINK have no required kind.
      expect(() =>
        service.assertCompatible(
          { kind: AssetKind.IMAGE },
          ContentItemType.TEXT,
        ),
      ).not.toThrow();
    });
  });

  describe('protected access', () => {
    it('throws when the asset has no storage key', () => {
      const { service } = buildService();
      expect(() => service.protectedAccess({ storageKey: null })).toThrow(
        ConflictException,
      );
    });

    it('issues a short-lived URL that expires after urlTtlSeconds', () => {
      const { service, storage } = buildService();
      const before = Date.now();
      const { url, expiresAt } = service.protectedAccess({
        storageKey: 'assets/pdf/k',
      });
      expect(storage.createProtectedUrl).toHaveBeenCalled();
      expect(url).toContain('token=');
      const ttlMs = expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThan((storageConfig.urlTtlSeconds - 5) * 1000);
      expect(ttlMs).toBeLessThanOrEqual(
        (storageConfig.urlTtlSeconds + 5) * 1000,
      );
    });
  });
});
