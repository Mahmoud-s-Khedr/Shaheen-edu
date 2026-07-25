import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AssetKind, AssetStatus, ContentItemType, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BunnyStorageProvider } from './bunny-storage.provider';

const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const documentMimes = new Set(['application/pdf', docxMime, xlsxMime, pptxMime]);
const downloadMimes = new Set([...documentMimes, 'application/zip', 'text/csv', 'text/plain']);
// Declared MIME -> allowed filename extensions. The extension must match the declared MIME (already validated against the kind), tying extension -> MIME -> kind.
const mimeExtensions: Record<string, string[]> = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'application/pdf': ['.pdf'], [docxMime]: ['.docx'], [xlsxMime]: ['.xlsx'], [pptxMime]: ['.pptx'], 'application/zip': ['.zip'], 'text/csv': ['.csv'], 'text/plain': ['.txt'] };

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly storage: BunnyStorageProvider, config: ConfigService<AppConfig, true>) { this.config = config.get('storage', { infer: true }); }
  private readonly config: AppConfig['storage'];

  private assertAdmin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private allowed(kind: AssetKind) { return kind === AssetKind.COVER_IMAGE || kind === AssetKind.IMAGE ? imageMimes : kind === AssetKind.PDF ? new Set(['application/pdf']) : kind === AssetKind.DOCUMENT ? documentMimes : downloadMimes; }
  private limit(kind: AssetKind) { return kind === AssetKind.COVER_IMAGE || kind === AssetKind.IMAGE ? this.config.imageMaxBytes : kind === AssetKind.DOWNLOADABLE_FILE ? this.config.downloadMaxBytes : this.config.documentMaxBytes; }
  private filename(name: string) { const sanitized = name.normalize('NFKC').replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 180); if (!sanitized || sanitized === '.' || sanitized === '..') throw new BadRequestException('Invalid filename'); return sanitized; }
  private assertExtension(mimetype: string, filename: string) { const dot = filename.lastIndexOf('.'); const extension = dot >= 0 ? filename.slice(dot).toLowerCase() : ''; if (!(mimeExtensions[mimetype] ?? []).includes(extension)) throw new BadRequestException('Filename extension does not match declared type'); }

  async upload(actor: RequestUser, kind: AssetKind, part: { file: Readable; filename: string; mimetype: string }) {
    this.assertAdmin(actor);
    if (kind === AssetKind.VIDEO) throw new BadRequestException('Use the video asset endpoint for videos');
    const filename = this.filename(part.filename);
    if (!this.allowed(kind).has(part.mimetype)) throw new BadRequestException('Unsupported MIME type for asset kind');
    this.assertExtension(part.mimetype, filename);
    const key = `assets/${kind.toLowerCase()}/${randomUUID()}-${filename}`;
    const asset = await this.prisma.asset.create({ data: { provider: 'BUNNY_STORAGE', kind, status: AssetStatus.UPLOADING, originalFilename: part.filename, filename, storageKey: key, mimeType: part.mimetype, uploadedById: actor.id } });
    let bytes = 0; const hash = createHash('sha256'); const first = Buffer.alloc(16); let firstLength = 0;
    const validator = new Transform({ transform: (chunk: Buffer, _encoding, callback) => { bytes += chunk.length; if (bytes > this.limit(kind)) return callback(new BadRequestException('File exceeds configured size limit')); if (firstLength < first.length) { const count = Math.min(first.length - firstLength, chunk.length); chunk.copy(first, firstLength, 0, count); firstLength += count; } hash.update(chunk); callback(null, chunk); } });
    const output = new PassThrough();
    try {
      await Promise.all([this.storage.upload(key, output, part.mimetype), pipeline(part.file, validator, output)]);
      if (!bytes) throw new BadRequestException('Empty files are not allowed');
      this.assertMagic(kind, part.mimetype, first.subarray(0, firstLength));
      const ready = await this.prisma.asset.update({ where: { id: asset.id }, data: { status: AssetStatus.READY, sizeBytes: bytes, checksum: hash.digest('hex'), readyAt: new Date() } });
      await this.audit.record({ actorUserId: actor.id, action: 'ASSET_UPLOADED', targetType: 'Asset', targetId: ready.id, metadata: { kind, sizeBytes: bytes } });
      return this.summary(ready);
    } catch (error) {
      await this.prisma.asset.update({ where: { id: asset.id }, data: { status: AssetStatus.FAILED, failedAt: new Date(), metadata: { error: 'upload_failed' } } });
      void this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  private assertMagic(kind: AssetKind, mime: string, first: Buffer) {
    const png = first.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); const jpg = first.subarray(0, 3).equals(Buffer.from([255, 216, 255])); const webp = first.subarray(0, 4).toString() === 'RIFF' && first.subarray(8, 12).toString() === 'WEBP'; const pdf = first.subarray(0, 5).toString() === '%PDF-';
    // OOXML (docx/xlsx/pptx) and plain zips are ZIP containers: 'PK\x03\x04', 'PK\x05\x06' (empty), or 'PK\x07\x08' (spanned). text/csv and text/plain have no reliable signature.
    const zip = first.subarray(0, 2).toString() === 'PK' && [3, 5, 7].includes(first[2]) && first[3] === first[2] + 1;
    if ((mime === 'image/png' && !png) || (mime === 'image/jpeg' && !jpg) || (mime === 'image/webp' && !webp) || ((kind === AssetKind.PDF || mime === 'application/pdf') && !pdf) || ((mime === docxMime || mime === xlsxMime || mime === pptxMime || mime === 'application/zip') && !zip)) throw new BadRequestException('File signature does not match declared MIME type');
  }

  async get(actor: RequestUser, id: string) { this.assertAdmin(actor); return this.summary(await this.getReadyOrAny(id)); }
  async list(actor: RequestUser) { this.assertAdmin(actor); return { data: (await this.prisma.asset.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })).map((x) => this.summary(x)) }; }
  async archive(actor: RequestUser, id: string) { this.assertAdmin(actor); const asset = await this.getReadyOrAny(id); const used = await this.isReferenced(id); if (used) throw new ConflictException('Referenced assets cannot be archived'); if (asset.storageKey) await this.storage.delete(asset.storageKey); const updated = await this.prisma.asset.update({ where: { id }, data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() } }); await this.audit.record({ actorUserId: actor.id, action: 'ASSET_ARCHIVED', targetType: 'Asset', targetId: id }); return this.summary(updated); }
  async delete(actor: RequestUser, id: string) { this.assertAdmin(actor); const asset = await this.prisma.asset.findUnique({ where: { id }, include: { video: true } }); if (!asset) throw new NotFoundException('Asset not found'); if (asset.video) throw new BadRequestException('Use the video asset endpoints to manage video assets'); if (await this.isReferenced(id)) throw new ConflictException('Referenced assets cannot be deleted'); if (asset.storageKey) await this.storage.delete(asset.storageKey); await this.prisma.asset.delete({ where: { id } }); await this.audit.record({ actorUserId: actor.id, action: 'ASSET_DELETED', targetType: 'Asset', targetId: id }); return { id, deleted: true }; }
  /** Archives an asset displaced by a replacement, but only once nothing else references it. */
  async archiveIfUnreferenced(actor: RequestUser, id: string) { const asset = await this.prisma.asset.findUnique({ where: { id } }); if (!asset || asset.status === AssetStatus.ARCHIVED) return; if (await this.isReferenced(id)) return; if (asset.storageKey) await this.storage.delete(asset.storageKey); await this.prisma.asset.update({ where: { id }, data: { status: AssetStatus.ARCHIVED, archivedAt: new Date() } }); await this.audit.record({ actorUserId: actor.id, action: 'ASSET_REPLACED', targetType: 'Asset', targetId: id }); }
  async getReady(id: string) { const asset = await this.getReadyOrAny(id); if (asset.status !== AssetStatus.READY) throw new ConflictException('Asset is not ready'); return asset; }
  async getReadyOrAny(id: string) { const asset = await this.prisma.asset.findUnique({ where: { id } }); if (!asset) throw new NotFoundException('Asset not found'); return asset; }
  async isReferenced(id: string) { const [content, refs, grades, subjects, courses, chapters, lessons, sections] = await this.prisma.$transaction([this.prisma.contentItem.count({ where: { primaryAssetId: id } }), this.prisma.assetReference.count({ where: { assetId: id } }), this.prisma.academicGrade.count({ where: { coverAssetId: id } }), this.prisma.subject.count({ where: { coverAssetId: id } }), this.prisma.course.count({ where: { coverAssetId: id } }), this.prisma.chapter.count({ where: { coverAssetId: id } }), this.prisma.lesson.count({ where: { coverAssetId: id } }), this.prisma.section.count({ where: { coverAssetId: id } })]); return content + refs + grades + subjects + courses + chapters + lessons + sections > 0; }
  assertCompatible(asset: { kind: AssetKind }, type: ContentItemType) { const expected: Record<ContentItemType, AssetKind | undefined> = { TEXT: undefined, EXTERNAL_LINK: undefined, VIDEO: AssetKind.VIDEO, PDF: AssetKind.PDF, IMAGE: AssetKind.IMAGE, DOCUMENT: AssetKind.DOCUMENT, DOWNLOADABLE_FILE: AssetKind.DOWNLOADABLE_FILE }; if (expected[type] && asset.kind !== expected[type]) throw new BadRequestException('Asset kind is incompatible with content type'); }
  protectedUrl(asset: { storageKey: string | null }) { if (!asset.storageKey) throw new ConflictException('Asset has no file delivery URL'); return this.storage.createProtectedUrl(asset.storageKey, new Date(Date.now() + this.config.urlTtlSeconds * 1000)); }
  protectedAccess(asset: { storageKey: string | null }) { const expiresAt = new Date(Date.now() + this.config.urlTtlSeconds * 1000); if (!asset.storageKey) throw new ConflictException('Asset has no file delivery URL'); return { url: this.storage.createProtectedUrl(asset.storageKey, expiresAt), expiresAt }; }
  async setCover(actor: RequestUser, resource: string, id: string, assetId: string) {
    this.assertAdmin(actor); const asset = await this.getReady(assetId); if (asset.kind !== AssetKind.COVER_IMAGE && asset.kind !== AssetKind.IMAGE) throw new BadRequestException('A cover must be an image asset');
    const clients: Record<string, { findUnique: Function; update: Function }> = { grades: this.prisma.academicGrade, subjects: this.prisma.subject, courses: this.prisma.course, chapters: this.prisma.chapter, lessons: this.prisma.lesson, sections: this.prisma.section };
    const client = clients[resource]; if (!client) throw new BadRequestException('Unsupported cover resource'); const record = await client.findUnique({ where: { id } }) as { coverAssetId: string | null } | null; if (!record) throw new NotFoundException('Hierarchy record not found');
    const previousCoverId = record.coverAssetId;
    await client.update({ where: { id }, data: { coverAssetId: assetId } }); await this.audit.record({ actorUserId: actor.id, action: 'HIERARCHY_COVER_SET', targetType: resource, targetId: id, metadata: { assetId } });
    if (previousCoverId && previousCoverId !== assetId) await this.archiveIfUnreferenced(actor, previousCoverId);
    return this.get(actor, assetId);
  }
  private summary(asset: any) { return { id: asset.id, provider: asset.provider, kind: asset.kind, status: asset.status, filename: asset.filename, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, checksum: asset.checksum, createdAt: asset.createdAt, readyAt: asset.readyAt, failedAt: asset.failedAt, archivedAt: asset.archivedAt }; }
}
