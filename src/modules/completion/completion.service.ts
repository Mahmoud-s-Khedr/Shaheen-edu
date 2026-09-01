import { Injectable } from '@nestjs/common';
import { ContentStatus } from '../../common/types/roles.enum';
import { PrismaService } from '../../database/prisma.service';

export type CompletionContainerType =
  'course' | 'chapter' | 'lesson' | 'section';
export type CompletionContainer = { id: string; type: CompletionContainerType };

/**
 * The single completion rollup used by student serializers. Completion is
 * persisted only on content items; container completion is always derived from
 * the published descendant placements visible in student delivery.
 */
@Injectable()
export class CompletionService {
  constructor(private readonly prisma: PrismaService) {}

  async containers(studentUserId: string, containers: CompletionContainer[]) {
    const unique = [
      ...new Map(
        containers.map((item) => [`${item.type}:${item.id}`, item]),
      ).values(),
    ];
    const ids = {
      course: unique
        .filter((item) => item.type === 'course')
        .map((item) => item.id),
      chapter: unique
        .filter((item) => item.type === 'chapter')
        .map((item) => item.id),
      lesson: unique
        .filter((item) => item.type === 'lesson')
        .map((item) => item.id),
      section: unique
        .filter((item) => item.type === 'section')
        .map((item) => item.id),
    };
    if (!unique.length) return new Map<string, boolean>();
    const placements = await this.prisma.contentPlacement.findMany({
      where: {
        contentItem: { status: ContentStatus.PUBLISHED },
        OR: [
          ...(ids.course.length
            ? [{ resolvedCourseId: { in: ids.course } }]
            : []),
          ...(ids.chapter.length
            ? [{ resolvedChapterId: { in: ids.chapter } }]
            : []),
          ...(ids.lesson.length
            ? [{ resolvedLessonId: { in: ids.lesson } }]
            : []),
          ...(ids.section.length
            ? [{ resolvedSectionId: { in: ids.section } }]
            : []),
        ],
      },
      select: {
        contentItemId: true,
        resolvedCourseId: true,
        resolvedChapterId: true,
        resolvedLessonId: true,
        resolvedSectionId: true,
      },
    });
    const completed = new Set(
      (
        await this.prisma.studentContentProgress.findMany({
          where: {
            studentUserId,
            contentItemId: { in: placements.map((item) => item.contentItemId) },
          },
          select: { contentItemId: true },
        })
      ).map((item) => item.contentItemId),
    );
    const descendants = new Map(
      unique.map((item) => [`${item.type}:${item.id}`, [] as string[]]),
    );
    for (const placement of placements) {
      const matches: Array<[CompletionContainerType, string | null]> = [
        ['course', placement.resolvedCourseId],
        ['chapter', placement.resolvedChapterId],
        ['lesson', placement.resolvedLessonId],
        ['section', placement.resolvedSectionId],
      ];
      for (const [type, id] of matches) {
        if (id) descendants.get(`${type}:${id}`)?.push(placement.contentItemId);
      }
    }
    return new Map(
      unique.map((container) => {
        const items =
          descendants.get(`${container.type}:${container.id}`) ?? [];
        return [
          `${container.type}:${container.id}`,
          items.length > 0 && items.every((id) => completed.has(id)),
        ];
      }),
    );
  }

  async progress(studentUserId: string, container: CompletionContainer) {
    const placements = await this.prisma.contentPlacement.findMany({
      where: {
        contentItem: { status: ContentStatus.PUBLISHED },
        ...(container.type === 'course'
          ? { resolvedCourseId: container.id }
          : {}),
        ...(container.type === 'chapter'
          ? { resolvedChapterId: container.id }
          : {}),
        ...(container.type === 'lesson'
          ? { resolvedLessonId: container.id }
          : {}),
        ...(container.type === 'section'
          ? { resolvedSectionId: container.id }
          : {}),
      },
      select: { contentItemId: true },
    });
    const total = placements.length;
    const completed = total
      ? await this.prisma.studentContentProgress.count({
          where: {
            studentUserId,
            contentItemId: { in: placements.map((item) => item.contentItemId) },
          },
        })
      : 0;
    return total ? Math.round((completed / total) * 100) : 0;
  }
}
