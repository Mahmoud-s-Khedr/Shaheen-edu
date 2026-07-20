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
}
