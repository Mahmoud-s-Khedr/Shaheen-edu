import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccessType, ContentStatus, EntitlementStatus } from '../../common/types/roles.enum';

@Injectable()
export class ContentAccessPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async assertContentItemAccess(contentItemId: string, studentUserId?: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id: contentItemId },
      include: {
        primaryAsset: { select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true } },
        assetReferences: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { asset: { select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true } } } },
        placement: {
          include: {
            course: { include: { subject: { include: { academicGrade: true } } } },
            chapter: { include: { course: { include: { subject: { include: { academicGrade: true } } } } } },
            lesson: { include: { chapter: { include: { course: { include: { subject: { include: { academicGrade: true } } } } } } } },
            section: { include: { lesson: { include: { chapter: { include: { course: { include: { subject: { include: { academicGrade: true } } } } } } } } } },
          },
        },
      },
    });
    if (!item?.placement) throw new NotFoundException('Content item not found');
    const placement: any = item.placement;
    const nodes: any[] = [item];
    if (placement.section) nodes.push(placement.section, placement.section.lesson, placement.section.lesson.chapter, placement.section.lesson.chapter.course, placement.section.lesson.chapter.course.subject, placement.section.lesson.chapter.course.subject.academicGrade);
    else if (placement.lesson) nodes.push(placement.lesson, placement.lesson.chapter, placement.lesson.chapter.course, placement.lesson.chapter.course.subject, placement.lesson.chapter.course.subject.academicGrade);
    else if (placement.chapter) nodes.push(placement.chapter, placement.chapter.course, placement.chapter.course.subject, placement.chapter.course.subject.academicGrade);
    else if (placement.course) nodes.push(placement.course, placement.course.subject, placement.course.subject.academicGrade);
    if (nodes.some((node) => node?.status !== ContentStatus.PUBLISHED)) throw new ForbiddenException('Content is not published');
    const effective = nodes.find((node) => node.accessType && node.accessType !== AccessType.INHERIT)?.accessType as AccessType;
    if (effective === AccessType.PUBLIC) return item;
    if (!studentUserId) throw new ForbiddenException('Student authentication is required');
    if (effective === AccessType.FREE) return item;
    const course = nodes.find((node) => node.subjectId)?.id as string;
    const chapterIds = nodes.filter((node) => node.courseId).map((node) => node.id as string);
    const now = new Date();
    const entitlement = await this.prisma.studentEntitlement.findFirst({ where: { studentUserId, status: EntitlementStatus.ACTIVE, revokedAt: null, startsAt: { lte: now }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ courseId: course }, { chapterId: { in: chapterIds } }] }] } });
    if (!entitlement) throw new ForbiddenException('A valid entitlement is required');
    return item;
  }

  /** A catalog-safe predicate for callers that need a lock indicator instead of a 403. */
  async canAccessContentItem(contentItemId: string, studentUserId?: string): Promise<boolean> {
    try {
      await this.assertContentItemAccess(contentItemId, studentUserId);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) return false;
      throw error;
    }
  }

  /** Explicit delivery shape: never expose a Prisma model or storage internals. */
  toDeliveryDto(item: any) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      textBody: item.textBody,
      externalUrl: item.externalUrl,
      estimatedDuration: item.estimatedDuration,
      placement: {
        courseId: item.placement.courseId,
        chapterId: item.placement.chapterId,
        lessonId: item.placement.lessonId,
        sectionId: item.placement.sectionId,
        sortOrder: item.placement.sortOrder,
      },
      primaryAsset: item.primaryAsset,
      attachments: item.assetReferences.map((reference: any) => ({ ...reference.asset, sortOrder: reference.sortOrder })),
    };
  }

  async assertAssetAttached(contentItemId: string, assetId: string): Promise<void> {
    const item = await this.prisma.contentItem.findUnique({ where: { id: contentItemId }, select: { primaryAssetId: true } });
    if (!item) throw new NotFoundException('Content item not found');
    if (item.primaryAssetId === assetId) return;
    const reference = await this.prisma.assetReference.findUnique({ where: { contentItemId_assetId: { contentItemId, assetId } }, select: { id: true } });
    if (!reference) throw new ForbiddenException('Asset is not attached to content item');
  }
}
