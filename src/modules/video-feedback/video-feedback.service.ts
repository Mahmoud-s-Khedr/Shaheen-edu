import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  AssetStatus,
  ContentStatus,
  Role,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import type {
  QueryVideoFeedbackDto,
  UpsertVideoFeedbackDto,
} from './dto/video-feedback.dto';

const CAIRO_ZONE = 'Africa/Cairo';

@Injectable()
export class VideoFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ContentAccessPolicyService,
  ) {}

  async upsert(
    studentUserId: string,
    videoAssetId: string,
    dto: UpsertVideoFeedbackDto,
  ) {
    const video = await this.prisma.videoAsset.findUnique({
      where: { assetId: videoAssetId },
      include: { asset: { select: { status: true } } },
    });
    if (
      !video ||
      video.asset.status !== AssetStatus.READY ||
      video.processingStatus !== VideoProcessingStatus.READY
    ) {
      throw new ConflictException('Video is not ready');
    }

    // A feedback-capable video must be a primary asset of exactly one currently
    // published item. The database trigger guarantees one owner for videos.
    const contentItem = await this.prisma.contentItem.findFirst({
      where: { primaryAssetId: videoAssetId, status: ContentStatus.PUBLISHED },
      select: { id: true },
    });
    if (!contentItem)
      throw new NotFoundException('Published video content item not found');
    await this.access.assertContentItemAccess(contentItem.id, studentUserId);

    const feedback = await this.prisma.videoFeedback.upsert({
      where: { studentUserId_videoAssetId: { studentUserId, videoAssetId } },
      create: {
        studentUserId,
        videoAssetId,
        comment: dto.comment ?? null,
        rating: dto.rating ?? null,
      },
      update: {
        comment: dto.comment ?? null,
        rating: dto.rating ?? null,
      },
    });
    return { ...feedback, contentItemId: contentItem.id };
  }

  async list(actor: RequestUser, query: QueryVideoFeedbackDto) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
    const createdAt = this.createdAtRange(query.from, query.to);
    const where: any = {
      ...(query.videoAssetId ? { videoAssetId: query.videoAssetId } : {}),
      ...(query.studentId ? { studentUserId: query.studentId } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query.contentItemId
        ? {
            videoAsset: {
              asset: { primaryFor: { some: { id: query.contentItemId } } },
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.videoFeedback.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          student: {
            select: {
              userId: true,
              fullName: true,
              user: { select: { loginIdentifier: true } },
            },
          },
          videoAsset: {
            select: {
              assetId: true,
              bunnyVideoId: true,
              durationSeconds: true,
              thumbnailUrl: true,
              asset: {
                select: {
                  filename: true,
                  primaryFor: {
                    select: { id: true, title: true, type: true, status: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.videoFeedback.count({ where }),
    ]);
    return {
      data: data.map((feedback) => ({
        id: feedback.id,
        comment: feedback.comment,
        rating: feedback.rating,
        createdAt: feedback.createdAt,
        updatedAt: feedback.updatedAt,
        student: {
          id: feedback.student.userId,
          fullName: feedback.student.fullName,
          loginIdentifier: feedback.student.user.loginIdentifier,
        },
        video: {
          id: feedback.videoAsset.assetId,
          filename: feedback.videoAsset.asset.filename,
          bunnyVideoId: feedback.videoAsset.bunnyVideoId,
          durationSeconds: feedback.videoAsset.durationSeconds,
          thumbnailUrl: feedback.videoAsset.thumbnailUrl,
        },
        contentItem: feedback.videoAsset.asset.primaryFor[0] ?? null,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async remove(actor: RequestUser, id: string) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
    const result = await this.prisma.videoFeedback.deleteMany({
      where: { id },
    });
    if (result.count === 0)
      throw new NotFoundException('Video feedback not found');
    return { id, deleted: true };
  }

  private createdAtRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const start = from ? this.cairoDate(from, 'from') : undefined;
    const end = to ? this.cairoDate(to, 'to').plus({ days: 1 }) : undefined;
    if (start && end && start >= end)
      throw new BadRequestException('from must be on or before to');
    return {
      ...(start ? { gte: start.toUTC().toJSDate() } : {}),
      ...(end ? { lt: end.toUTC().toJSDate() } : {}),
    };
  }

  private cairoDate(value: string, field: string) {
    const date = DateTime.fromISO(value, { zone: CAIRO_ZONE }).startOf('day');
    if (!date.isValid || date.toISODate() !== value)
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    return date;
  }
}
