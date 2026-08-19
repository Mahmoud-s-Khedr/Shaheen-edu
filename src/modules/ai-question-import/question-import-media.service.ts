import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import {
  AssetKind,
  AssetProvider,
  AssetStatus,
  QuestionImportMediaDetectionSource,
  QuestionImportMediaStatus,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import type { PdfVisualRegion } from './pdf-transcription.client';

export type NormalizedBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
const AUTO_ELIGIBLE_CONFIDENCE = 0.9;
const EDGE_MARGIN = 8;
const PADDING = 8;
const MIN_SIZE = 16;

@Injectable()
export class QuestionImportMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: BunnyStorageProvider,
    private readonly assets: AssetsService,
  ) {}

  async materializePage(
    batch: { id: string; createdById: string },
    pageNumber: number,
    pageImage: Buffer,
    regions: PdfVisualRegion[],
    rawEvidence: unknown,
  ) {
    const metadata = await sharp(pageImage).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error('Unable to read rendered PDF page dimensions');
    const proposals = regions
      .map((region) => ({
        region,
        checked: this.validate(
          region.bounds,
          metadata.width!,
          metadata.height!,
          region.warnings,
        ),
      }))
      .filter((item) => item.checked.valid)
      .sort((a, b) => b.region.confidence - a.region.confidence);
    const results = [];
    for (const proposal of proposals) {
      try {
        results.push(
          await this.materializeProposal(
            batch,
            pageNumber,
            pageImage,
            metadata.width,
            metadata.height,
            proposal.region,
            proposal.checked,
            rawEvidence,
          ),
        );
      } catch (error: any) {
        results.push(
          await this.recordFailedProposal(
            batch,
            pageNumber,
            metadata.width,
            metadata.height,
            proposal.region,
            proposal.checked,
            rawEvidence,
            error,
          ),
        );
      }
    }
    return results;
  }

  async createManualRegion(
    batch: { id: string; createdById: string },
    pageNumber: number,
    pageImage: Buffer,
    region: PdfVisualRegion,
    actorId: string,
  ) {
    const metadata = await sharp(pageImage).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error('Unable to read rendered PDF page dimensions');
    const checked = this.validate(
      region.bounds,
      metadata.width,
      metadata.height,
      region.warnings,
    );
    if (!checked.valid)
      throw new Error(`Invalid visual bounds: ${checked.flags.join(', ')}`);
    return this.materializeProposal(
      batch,
      pageNumber,
      pageImage,
      metadata.width,
      metadata.height,
      region,
      checked,
      null,
      QuestionImportMediaDetectionSource.MANUAL,
      actorId,
    );
  }

  async replaceCanonicalRegion(
    media: any,
    batch: { id: string; createdById: string },
    pageImage: Buffer,
    region: PdfVisualRegion,
    actorId: string,
  ) {
    const metadata = await sharp(pageImage).metadata();
    if (!metadata.width || !metadata.height)
      throw new Error('Unable to read rendered PDF page dimensions');
    const checked = this.validate(
      region.bounds,
      metadata.width,
      metadata.height,
      region.warnings,
    );
    if (!checked.valid)
      throw new Error(`Invalid visual bounds: ${checked.flags.join(', ')}`);
    const image = await this.crop(pageImage, checked.renderedBounds!);
    const checksum = createHash('sha256').update(image).digest('hex');
    const asset = await this.createAsset(
      batch.createdById,
      media.mediaKey,
      image,
      checksum,
    );
    try {
      await this.prisma.$transaction(async (tx: any) => {
        await tx.questionImportMediaDetection.updateMany({
          where: { mediaId: media.id },
          data: { accepted: false },
        });
        await tx.questionImportMediaDetection.create({
          data: {
            mediaId: media.id,
            source: QuestionImportMediaDetectionSource.MANUAL,
            normalizedBounds: checked.bounds,
            type: region.type,
            confidence: region.confidence,
            description: region.description,
            warnings: region.warnings,
            validationFlags: checked.flags,
            accepted: true,
            createdById: actorId,
          },
        });
        await tx.questionImportMedia.update({
          where: { id: media.id },
          data: {
            normalizedBounds: checked.bounds,
            renderedBounds: checked.renderedBounds,
            pageDimensions: { width: metadata.width, height: metadata.height },
            type: region.type,
            confidence: region.confidence,
            description: region.description,
            warnings: region.warnings,
            validationFlags: checked.flags,
            checksum,
            assetId: asset.id,
            status: this.statusFor(region, checked.flags),
            materializedAt: new Date(),
            errorDetail: null,
          },
        });
      });
    } catch (error) {
      await this.assets.archiveIfUnreferenced({ id: actorId }, asset.id);
      throw error;
    }
    if (media.assetId && media.assetId !== asset.id)
      await this.assets.archiveIfUnreferenced({ id: actorId }, media.assetId);
    return this.prisma.questionImportMedia.findUniqueOrThrow({
      where: { id: media.id },
      include: { asset: true, detections: { orderBy: { createdAt: 'asc' } } },
    });
  }

  private async materializeProposal(
    batch: { id: string; createdById: string },
    pageNumber: number,
    pageImage: Buffer,
    pageWidth: number,
    pageHeight: number,
    region: PdfVisualRegion,
    checked: ReturnType<QuestionImportMediaService['validate']>,
    rawEvidence: unknown,
    source: QuestionImportMediaDetectionSource = QuestionImportMediaDetectionSource.AI,
    createdById?: string,
  ) {
    const existing: any[] = await this.prisma.questionImportMedia.findMany({
      where: {
        batchId: batch.id,
        pageNumber,
        status: { not: QuestionImportMediaStatus.REJECTED },
      },
    });
    const duplicate = existing.find((media) =>
      this.nearDuplicate(
        media.normalizedBounds as NormalizedBounds,
        checked.bounds!,
      ),
    );
    if (duplicate) {
      await this.prisma.questionImportMediaDetection.create({
        data: {
          mediaId: duplicate.id,
          source,
          normalizedBounds: checked.bounds!,
          type: region.type,
          confidence: region.confidence,
          description: region.description,
          warnings: region.warnings,
          rawEvidence: rawEvidence as any,
          validationFlags: checked.flags,
          accepted: false,
          createdById,
        },
      });
      return duplicate;
    }
    const mediaKey = `M${String((await this.prisma.questionImportMedia.count({ where: { batchId: batch.id } })) + 1).padStart(4, '0')}`;
    const image = await this.crop(pageImage, checked.renderedBounds!);
    const checksum = createHash('sha256').update(image).digest('hex');
    const asset = await this.createAsset(
      batch.createdById,
      mediaKey,
      image,
      checksum,
    );
    try {
      return await this.prisma.$transaction(async (tx: any) => {
        const media = await tx.questionImportMedia.create({
          data: {
            batchId: batch.id,
            mediaKey,
            pageNumber,
            normalizedBounds: checked.bounds,
            renderedBounds: checked.renderedBounds,
            pageDimensions: { width: pageWidth, height: pageHeight },
            renderDpi: 350,
            type: region.type,
            confidence: region.confidence,
            description: region.description.trim(),
            warnings: region.warnings,
            validationFlags: checked.flags,
            checksum,
            assetId: asset.id,
            status: this.statusFor(region, checked.flags),
            materializedAt: new Date(),
          },
        });
        await tx.questionImportMediaDetection.create({
          data: {
            mediaId: media.id,
            source,
            normalizedBounds: checked.bounds,
            type: region.type,
            confidence: region.confidence,
            description: region.description,
            warnings: region.warnings,
            rawEvidence: rawEvidence as any,
            validationFlags: checked.flags,
            accepted: true,
            createdById,
          },
        });
        return media;
      });
    } catch (error) {
      await this.assets.archiveIfUnreferenced(
        { id: batch.createdById },
        asset.id,
      );
      throw error;
    }
  }

  private async recordFailedProposal(
    batch: { id: string },
    pageNumber: number,
    pageWidth: number,
    pageHeight: number,
    region: PdfVisualRegion,
    checked: ReturnType<QuestionImportMediaService['validate']>,
    rawEvidence: unknown,
    error: Error,
  ) {
    const existing = await this.prisma.questionImportMedia.findFirst({
      where: {
        batchId: batch.id,
        pageNumber,
        normalizedBounds: checked.bounds as any,
        status: QuestionImportMediaStatus.FAILED,
      },
    });
    if (existing)
      return this.prisma.questionImportMedia.update({
        where: { id: existing.id },
        data: { errorDetail: error.message.slice(0, 2000) },
      });
    const mediaKey = `M${String((await this.prisma.questionImportMedia.count({ where: { batchId: batch.id } })) + 1).padStart(4, '0')}`;
    return this.prisma.$transaction(async (tx: any) => {
      const media = await tx.questionImportMedia.create({
        data: {
          batchId: batch.id,
          mediaKey,
          pageNumber,
          normalizedBounds: checked.bounds,
          renderedBounds: checked.renderedBounds,
          pageDimensions: { width: pageWidth, height: pageHeight },
          renderDpi: 350,
          type: region.type,
          confidence: region.confidence,
          description: region.description.trim(),
          warnings: region.warnings,
          validationFlags: checked.flags,
          status: QuestionImportMediaStatus.FAILED,
          errorDetail: error.message.slice(0, 2000),
        },
      });
      await tx.questionImportMediaDetection.create({
        data: {
          mediaId: media.id,
          source: QuestionImportMediaDetectionSource.AI,
          normalizedBounds: checked.bounds,
          type: region.type,
          confidence: region.confidence,
          description: region.description,
          warnings: region.warnings,
          rawEvidence: rawEvidence as any,
          validationFlags: checked.flags,
          accepted: true,
        },
      });
      return media;
    });
  }

  private statusFor(region: PdfVisualRegion, flags: string[]) {
    return region.confidence >= AUTO_ELIGIBLE_CONFIDENCE &&
      !flags.length &&
      !region.warnings.length
      ? QuestionImportMediaStatus.ELIGIBLE
      : QuestionImportMediaStatus.REVIEW_REQUIRED;
  }

  private validate(
    bounds: NormalizedBounds,
    pageWidth: number,
    pageHeight: number,
    warnings: string[],
  ) {
    const flags: string[] = [];
    if (
      !bounds ||
      ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(
        Number.isInteger,
      )
    )
      return { valid: false, flags: ['non_integer_bounds'] };
    if (
      bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > 1000 ||
      bounds.bottom > 1000 ||
      bounds.left >= bounds.right ||
      bounds.top >= bounds.bottom
    )
      return { valid: false, flags: ['out_of_page_bounds'] };
    if (
      bounds.left <= EDGE_MARGIN ||
      bounds.top <= EDGE_MARGIN ||
      bounds.right >= 1000 - EDGE_MARGIN ||
      bounds.bottom >= 1000 - EDGE_MARGIN
    )
      flags.push('touches_page_edge');
    if (warnings.length) flags.push('model_warning');
    const padded: NormalizedBounds = {
      left: Math.max(0, bounds.left - PADDING),
      top: Math.max(0, bounds.top - PADDING),
      right: Math.min(1000, bounds.right + PADDING),
      bottom: Math.min(1000, bounds.bottom + PADDING),
    };
    const renderedBounds = {
      left: Math.floor((padded.left * pageWidth) / 1000),
      top: Math.floor((padded.top * pageHeight) / 1000),
      width: Math.ceil(((padded.right - padded.left) * pageWidth) / 1000),
      height: Math.ceil(((padded.bottom - padded.top) * pageHeight) / 1000),
    };
    if (renderedBounds.width < MIN_SIZE || renderedBounds.height < MIN_SIZE)
      return {
        valid: false,
        flags: [...flags, 'too_small'],
        bounds,
        renderedBounds,
      };
    return { valid: true, flags, bounds, renderedBounds };
  }

  private nearDuplicate(a: NormalizedBounds, b: NormalizedBounds) {
    const left = Math.max(a.left, b.left),
      top = Math.max(a.top, b.top),
      right = Math.min(a.right, b.right),
      bottom = Math.min(a.bottom, b.bottom);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const aArea = (a.right - a.left) * (a.bottom - a.top),
      bArea = (b.right - b.left) * (b.bottom - b.top);
    return (
      intersection / (aArea + bArea - intersection) >= 0.85 ||
      intersection / Math.min(aArea, bArea) >= 0.95
    );
  }

  private crop(
    pageImage: Buffer,
    bounds: { left: number; top: number; width: number; height: number },
  ) {
    return sharp(pageImage).extract(bounds).png().toBuffer();
  }

  private async createAsset(
    uploadedById: string,
    mediaKey: string,
    image: Buffer,
    checksum: string,
  ) {
    const filename = `${mediaKey.toLowerCase()}.png`;
    const storageKey = `assets/image/question-import/${randomUUID()}-${filename}`;
    try {
      await this.storage.upload(storageKey, Readable.from(image), 'image/png');
      return await this.prisma.asset.create({
        data: {
          provider: AssetProvider.BUNNY_STORAGE,
          kind: AssetKind.IMAGE,
          status: AssetStatus.READY,
          originalFilename: filename,
          filename,
          storageKey,
          mimeType: 'image/png',
          sizeBytes: image.length,
          checksum,
          uploadedById,
          readyAt: new Date(),
          metadata: { generatedBy: 'question-import-visual-extraction' },
        },
      });
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }
}
