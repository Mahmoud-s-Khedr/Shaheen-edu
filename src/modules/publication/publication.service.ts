import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetKind,
  AssetStatus,
  ContentItemType,
  ContentStatus,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';

export type PublishableResource =
  | 'academicGrade'
  | 'subject'
  | 'course'
  | 'chapter'
  | 'lesson'
  | 'section'
  | 'contentItem';

const assetKindForType: Partial<Record<ContentItemType, AssetKind>> = {
  VIDEO: AssetKind.VIDEO,
  PDF: AssetKind.PDF,
  IMAGE: AssetKind.IMAGE,
  DOCUMENT: AssetKind.DOCUMENT,
  DOWNLOADABLE_FILE: AssetKind.DOWNLOADABLE_FILE,
};

/** Shared lifecycle rules for every student-visible resource. */
@Injectable()
export class PublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    resource: PublishableResource,
    id: string,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const record = await this.find(resource, id, tx);
      if (!record) throw new NotFoundException(`${resource} not found`);
      if (record.status !== ContentStatus.DRAFT) {
        throw new ConflictException('Only a draft record can be published');
      }
      await this.assertAncestry(resource, record, tx);
      await this.assertOrdering(resource, record, tx);
      if (resource === 'course' && record.accessType === 'INHERIT') {
        throw new ConflictException(
          'A course must have an explicit access type',
        );
      }
      if (resource === 'contentItem') await this.assertContentItem(record, tx);

      const result = await (tx as any)[resource].updateMany({
        where: { id, status: ContentStatus.DRAFT },
        data: {
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
          archivedAt: null,
          updatedById: actorId,
        },
      });
      if (result.count !== 1)
        throw new ConflictException('Publication state changed; retry');
    });
  }

  async assertCanArchive(
    resource: Exclude<PublishableResource, 'contentItem'>,
    id: string,
  ): Promise<void> {
    const record = await this.find(resource, id, this.prisma);
    if (!record) throw new NotFoundException(`${resource} not found`);
    const hasPublishedDescendant = await this.hasPublishedDescendant(
      resource,
      id,
    );
    if (hasPublishedDescendant) {
      throw new ConflictException(
        'Cannot archive a record with published descendants',
      );
    }
    await this.snapshotActiveEntitlements(resource, id);
  }

  /** Preserve the students who were entitled at the instant a hierarchy node is archived. */
  private async snapshotActiveEntitlements(
    resource: Exclude<PublishableResource, 'contentItem'>,
    id: string,
  ): Promise<void> {
    const target = await this.archiveTarget(resource, id);
    const now = new Date();
    const grants = await this.prisma.studentEntitlement.findMany({
      where: {
        status: 'ACTIVE',
        revokedAt: null,
        startsAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          {
            OR: [
              { courseId: { in: target.courseIds } },
              ...(target.chapterIds.length
                ? [{ chapterId: { in: target.chapterIds } }]
                : []),
            ],
          },
        ],
      },
      select: { id: true, studentUserId: true },
      orderBy: { createdAt: 'asc' },
    });
    const firstGrantByStudent = new Map<string, string>();
    for (const grant of grants)
      if (!firstGrantByStudent.has(grant.studentUserId))
        firstGrantByStudent.set(grant.studentUserId, grant.id);
    if (!firstGrantByStudent.size) return;
    await this.prisma.archivedAccessSnapshot.createMany({
      data: [...firstGrantByStudent].map(
        ([studentUserId, sourceEntitlementId]) => ({
          studentUserId,
          sourceEntitlementId,
          resourceType: target.type,
          resourceId: id,
          archivedAt: now,
        }),
      ),
      skipDuplicates: true,
    });
  }

  private async archiveTarget(
    resource: Exclude<PublishableResource, 'contentItem'>,
    id: string,
  ): Promise<{ type: any; courseIds: string[]; chapterIds: string[] }> {
    if (resource === 'course') {
      const chapters = await this.prisma.chapter.findMany({
        where: { courseId: id },
        select: { id: true },
      });
      return {
        type: 'COURSE',
        courseIds: [id],
        chapterIds: chapters.map((x) => x.id),
      };
    }
    if (resource === 'chapter') {
      const x = await this.prisma.chapter.findUnique({ where: { id } });
      if (!x) throw new NotFoundException('chapter not found');
      return { type: 'CHAPTER', courseIds: [x.courseId], chapterIds: [id] };
    }
    if (resource === 'lesson') {
      const x = await this.prisma.lesson.findUnique({
        where: { id },
        include: { chapter: true },
      });
      if (!x) throw new NotFoundException('lesson not found');
      return {
        type: 'LESSON',
        courseIds: [x.chapter.courseId],
        chapterIds: [x.chapterId],
      };
    }
    if (resource === 'section') {
      const x = await this.prisma.section.findUnique({
        where: { id },
        include: { lesson: { include: { chapter: true } } },
      });
      if (!x) throw new NotFoundException('section not found');
      return {
        type: 'SECTION',
        courseIds: [x.lesson.chapter.courseId],
        chapterIds: [x.lesson.chapterId],
      };
    }
    if (resource === 'subject') {
      const courses = await this.prisma.course.findMany({
        where: { subjectId: id },
        include: { chapters: { select: { id: true } } },
      });
      return {
        type: 'SUBJECT',
        courseIds: courses.map((x) => x.id),
        chapterIds: courses.flatMap((x) => x.chapters.map((c) => c.id)),
      };
    }
    const courses = await this.prisma.course.findMany({
      where: { subject: { academicGradeId: id } },
      include: { chapters: { select: { id: true } } },
    });
    return {
      type: 'ACADEMIC_GRADE',
      courseIds: courses.map((x) => x.id),
      chapterIds: courses.flatMap((x) => x.chapters.map((c) => c.id)),
    };
  }

  /** Reusable ancestry gate for resources scoped directly to a chapter. */
  async assertPublishedChapterAncestry(
    chapterId: string,
    client: any = this.prisma,
  ): Promise<void> {
    const chapter = await client.chapter.findUnique({
      where: { id: chapterId },
      include: {
        course: { include: { subject: { include: { academicGrade: true } } } },
      },
    });
    if (!chapter) throw new NotFoundException('Chapter not found');
    if (
      [
        chapter,
        chapter.course,
        chapter.course.subject,
        chapter.course.subject.academicGrade,
      ].some((node: any) => node.status !== ContentStatus.PUBLISHED)
    ) {
      throw new ConflictException('Every chapter ancestor must be published');
    }
  }

  private async assertContentItem(item: any, tx: any) {
    if (!item.placement)
      throw new ConflictException('Content item requires a placement');
    if (item.type === ContentItemType.TEXT && !item.textBody?.trim()) {
      throw new ConflictException('TEXT content requires a non-empty textBody');
    }
    if (item.type === ContentItemType.EXTERNAL_LINK) {
      try {
        if (
          !item.externalUrl ||
          new URL(item.externalUrl).protocol !== 'https:'
        )
          throw new Error();
      } catch {
        throw new ConflictException(
          'EXTERNAL_LINK content requires a valid HTTPS externalUrl',
        );
      }
    }
    const expectedKind = assetKindForType[item.type as ContentItemType];
    if (!expectedKind) return;
    if (!item.primaryAssetId) {
      if (item.type === ContentItemType.VIDEO) throw this.videoNotReady(null);
      throw new ConflictException(
        'Asset-backed content requires a primary asset before publication',
      );
    }
    const asset = await tx.asset.findUnique({
      where: { id: item.primaryAssetId },
      include: { video: true },
    });
    if (
      item.type === ContentItemType.VIDEO &&
      (!asset ||
        asset.kind !== AssetKind.VIDEO ||
        asset.status !== AssetStatus.READY ||
        asset.video?.processingStatus !== VideoProcessingStatus.READY)
    ) {
      throw this.videoNotReady(asset);
    }
    if (
      !asset ||
      asset.status !== AssetStatus.READY ||
      asset.kind !== expectedKind
    ) {
      throw new ConflictException(
        'Content requires a ready, compatible primary asset',
      );
    }
    if (
      item.type === ContentItemType.VIDEO &&
      asset.video?.processingStatus !== VideoProcessingStatus.READY
    ) {
      throw new ConflictException(
        'Video processing must complete before publication',
      );
    }
  }

  private videoNotReady(asset: any): AppException {
    return new AppException(
      'Video is not ready for publication',
      409,
      'VIDEO_NOT_READY',
      {
        assetId: asset?.id ?? null,
        assetStatus: asset?.status ?? null,
        processingStatus: asset?.video?.processingStatus ?? null,
        processingProgress: asset?.video?.processingProgress ?? null,
        readyAt: asset?.readyAt ?? null,
        failedAt: asset?.failedAt ?? null,
      },
    );
  }

  private async assertAncestry(
    resource: PublishableResource,
    record: any,
    tx: any,
  ) {
    const parent =
      resource === 'subject'
        ? await tx.academicGrade.findUnique({
            where: { id: record.academicGradeId },
          })
        : resource === 'course'
          ? await tx.subject.findUnique({
              where: { id: record.subjectId },
              include: { academicGrade: true },
            })
          : resource === 'chapter'
            ? await tx.course.findUnique({
                where: { id: record.courseId },
                include: { subject: { include: { academicGrade: true } } },
              })
            : resource === 'lesson'
              ? await tx.chapter.findUnique({
                  where: { id: record.chapterId },
                  include: {
                    course: {
                      include: {
                        subject: { include: { academicGrade: true } },
                      },
                    },
                  },
                })
              : resource === 'section'
                ? await tx.lesson.findUnique({
                    where: { id: record.lessonId },
                    include: {
                      chapter: {
                        include: {
                          course: {
                            include: {
                              subject: { include: { academicGrade: true } },
                            },
                          },
                        },
                      },
                    },
                  })
                : resource === 'contentItem'
                  ? await this.placementParent(record.placement, tx)
                  : null;
    if (!parent) return;
    const nodes = this.flattenParent(parent);
    if (nodes.some((node: any) => node?.status !== ContentStatus.PUBLISHED)) {
      throw new ConflictException(
        'Every parent in the ancestry must be published',
      );
    }
  }

  private async placementParent(placement: any, tx: any) {
    if (placement.courseId)
      return tx.course.findUnique({
        where: { id: placement.courseId },
        include: { subject: { include: { academicGrade: true } } },
      });
    if (placement.chapterId)
      return tx.chapter.findUnique({
        where: { id: placement.chapterId },
        include: {
          course: {
            include: { subject: { include: { academicGrade: true } } },
          },
        },
      });
    if (placement.lessonId)
      return tx.lesson.findUnique({
        where: { id: placement.lessonId },
        include: {
          chapter: {
            include: {
              course: {
                include: { subject: { include: { academicGrade: true } } },
              },
            },
          },
        },
      });
    return tx.section.findUnique({
      where: { id: placement.sectionId },
      include: {
        lesson: {
          include: {
            chapter: {
              include: {
                course: {
                  include: { subject: { include: { academicGrade: true } } },
                },
              },
            },
          },
        },
      },
    });
  }

  private flattenParent(node: any): any[] {
    const nodes: any[] = [];
    let current: any = node;
    while (current) {
      nodes.push(current);
      current =
        current.academicGrade ??
        current.subject ??
        current.course ??
        current.chapter ??
        current.lesson;
    }
    return nodes;
  }

  private async assertOrdering(
    resource: PublishableResource,
    record: any,
    tx: any,
  ) {
    if (resource === 'contentItem') {
      const placement = record.placement;
      const where = placement.courseId
        ? { courseId: placement.courseId }
        : placement.chapterId
          ? { chapterId: placement.chapterId }
          : placement.lessonId
            ? { lessonId: placement.lessonId }
            : { sectionId: placement.sectionId };
      const siblings = await tx.contentPlacement.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      if (
        siblings.some(
          (item: any, index: number) => item.sortOrder !== index + 1,
        )
      )
        throw new ConflictException('Content placement ordering is invalid');
      return;
    }
    const field: Record<string, string | null> = {
      academicGrade: null,
      subject: 'academicGradeId',
      course: 'subjectId',
      chapter: 'courseId',
      lesson: 'chapterId',
      section: 'lessonId',
    };
    const parentField = field[resource];
    const where = parentField ? { [parentField]: record[parentField] } : {};
    const siblings = await tx[resource].findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (
      siblings.some((item: any, index: number) => item.sortOrder !== index + 1)
    )
      throw new ConflictException('Sibling ordering is invalid');
  }

  private async find(resource: PublishableResource, id: string, client: any) {
    return resource === 'contentItem'
      ? client.contentItem.findUnique({
          where: { id },
          include: { placement: true },
        })
      : client[resource].findUnique({ where: { id } });
  }

  private async hasPublishedDescendant(
    resource: Exclude<PublishableResource, 'contentItem'>,
    id: string,
  ): Promise<boolean> {
    const published = ContentStatus.PUBLISHED;
    if (resource === 'section')
      return Boolean(
        await this.prisma.contentItem.count({
          where: { status: published, placement: { is: { sectionId: id } } },
        }),
      );
    if (resource === 'lesson')
      return Boolean(
        await this.prisma
          .$queryRawUnsafe<number[]>(
            `SELECT 1 FROM \"Lesson\" l LEFT JOIN \"Section\" s ON s.\"lessonId\" = l.id LEFT JOIN \"ContentPlacement\" p ON p.\"lessonId\" = l.id OR p.\"sectionId\" = s.id LEFT JOIN \"ContentItem\" i ON i.id = p.\"contentItemId\" WHERE l.id = $1 AND (s.status = 'PUBLISHED' OR i.status = 'PUBLISHED') LIMIT 1`,
            id,
          )
          .then((rows) => rows.length),
      );
    if (resource === 'chapter')
      return Boolean(
        await this.prisma
          .$queryRawUnsafe<number[]>(
            `SELECT 1 FROM \"Chapter\" c LEFT JOIN \"Lesson\" l ON l.\"chapterId\" = c.id LEFT JOIN \"Section\" s ON s.\"lessonId\" = l.id LEFT JOIN \"ContentPlacement\" p ON p.\"chapterId\" = c.id OR p.\"lessonId\" = l.id OR p.\"sectionId\" = s.id LEFT JOIN \"ContentItem\" i ON i.id = p.\"contentItemId\" WHERE c.id = $1 AND (l.status = 'PUBLISHED' OR s.status = 'PUBLISHED' OR i.status = 'PUBLISHED') LIMIT 1`,
            id,
          )
          .then((rows) => rows.length),
      );
    if (resource === 'course')
      return Boolean(
        await this.prisma
          .$queryRawUnsafe<number[]>(
            `SELECT 1 FROM \"Course\" c LEFT JOIN \"Chapter\" h ON h.\"courseId\" = c.id LEFT JOIN \"Lesson\" l ON l.\"chapterId\" = h.id LEFT JOIN \"Section\" s ON s.\"lessonId\" = l.id LEFT JOIN \"ContentPlacement\" p ON p.\"courseId\" = c.id OR p.\"chapterId\" = h.id OR p.\"lessonId\" = l.id OR p.\"sectionId\" = s.id LEFT JOIN \"ContentItem\" i ON i.id = p.\"contentItemId\" WHERE c.id = $1 AND (h.status = 'PUBLISHED' OR l.status = 'PUBLISHED' OR s.status = 'PUBLISHED' OR i.status = 'PUBLISHED') LIMIT 1`,
            id,
          )
          .then((rows) => rows.length),
      );
    if (resource === 'subject')
      return Boolean(
        await this.prisma
          .$queryRawUnsafe<number[]>(
            `SELECT 1 FROM \"Subject\" s LEFT JOIN \"Course\" c ON c.\"subjectId\" = s.id LEFT JOIN \"Chapter\" h ON h.\"courseId\" = c.id LEFT JOIN \"Lesson\" l ON l.\"chapterId\" = h.id LEFT JOIN \"Section\" x ON x.\"lessonId\" = l.id LEFT JOIN \"ContentPlacement\" p ON p.\"courseId\" = c.id OR p.\"chapterId\" = h.id OR p.\"lessonId\" = l.id OR p.\"sectionId\" = x.id LEFT JOIN \"ContentItem\" i ON i.id = p.\"contentItemId\" WHERE s.id = $1 AND (c.status = 'PUBLISHED' OR h.status = 'PUBLISHED' OR l.status = 'PUBLISHED' OR x.status = 'PUBLISHED' OR i.status = 'PUBLISHED') LIMIT 1`,
            id,
          )
          .then((rows) => rows.length),
      );
    return Boolean(
      await this.prisma
        .$queryRawUnsafe<number[]>(
          `SELECT 1 FROM \"AcademicGrade\" g LEFT JOIN \"Subject\" s ON s.\"academicGradeId\" = g.id LEFT JOIN \"Course\" c ON c.\"subjectId\" = s.id LEFT JOIN \"Chapter\" h ON h.\"courseId\" = c.id LEFT JOIN \"Lesson\" l ON l.\"chapterId\" = h.id LEFT JOIN \"Section\" x ON x.\"lessonId\" = l.id LEFT JOIN \"ContentPlacement\" p ON p.\"courseId\" = c.id OR p.\"chapterId\" = h.id OR p.\"lessonId\" = l.id OR p.\"sectionId\" = x.id LEFT JOIN \"ContentItem\" i ON i.id = p.\"contentItemId\" WHERE g.id = $1 AND (s.status = 'PUBLISHED' OR c.status = 'PUBLISHED' OR h.status = 'PUBLISHED' OR l.status = 'PUBLISHED' OR x.status = 'PUBLISHED' OR i.status = 'PUBLISHED') LIMIT 1`,
          id,
        )
        .then((rows) => rows.length),
    );
  }
}
