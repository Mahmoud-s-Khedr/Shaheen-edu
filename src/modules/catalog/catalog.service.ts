import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessType, ContentStatus, EntitlementStatus } from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../database/prisma.service';
import { CatalogCoursesQueryDto } from './dto/catalog-courses-query.dto';
import { CatalogSubjectsQueryDto } from './dto/catalog-subjects-query.dto';

const published = ContentStatus.PUBLISHED;
const order = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
const publicNode = (record: any, isLocked?: boolean) => ({ id: record.id, title: record.title, slug: record.slug, description: record.description, sortOrder: record.sortOrder, coverAssetId: record.coverAssetId ?? null, ...(record.accessType ? { accessType: record.accessType } : {}), ...(isLocked === undefined ? {} : { isLocked }) });
const publicItem = (placement: any, isLocked: boolean) => ({ id: placement.contentItem.id, type: placement.contentItem.type, title: placement.contentItem.title, description: placement.contentItem.description, estimatedDuration: placement.contentItem.estimatedDuration, accessType: placement.contentItem.accessType, isLocked, sortOrder: placement.sortOrder });
const placements = { where: { contentItem: { status: published } }, include: { contentItem: true }, orderBy: order };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async subjects(query: CatalogSubjectsQueryDto) {
    const where = { status: published, academicGradeId: query.academicGradeId };
    const [data, total] = await this.prisma.$transaction([this.prisma.subject.findMany({ where, orderBy: order, skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.subject.count({ where })]);
    return { data: data.map((record) => publicNode(record)), meta: toPaginationMeta(query.page, query.limit, total) };
  }

  async courses(query: CatalogCoursesQueryDto) {
    const where = { status: published, subjectId: query.subjectId };
    const [data, total] = await this.prisma.$transaction([this.prisma.course.findMany({ where, orderBy: order, skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.course.count({ where })]);
    return { data: data.map((record) => publicNode(record)), meta: toPaginationMeta(query.page, query.limit, total) };
  }

  async course(id: string) {
    const record = await this.prisma.course.findFirst({ where: { id, status: published, subject: { status: published, academicGrade: { status: published } } }, include: { subject: { include: { academicGrade: true } } } });
    if (!record) throw new NotFoundException('Published course not found');
    return { ...publicNode(record), subject: publicNode(record.subject), academicGrade: publicNode(record.subject.academicGrade) };
  }

  async outline(id: string, studentId?: string) {
    const course = await this.prisma.course.findFirst({
      where: { id, status: published, subject: { status: published, academicGrade: { status: published } } },
      include: {
        contentPlacements: placements,
        chapters: {
          where: { status: published }, orderBy: order,
          include: {
            contentPlacements: placements,
            lessons: {
              where: { status: published }, orderBy: order,
              include: {
                contentPlacements: placements,
                sections: { where: { status: published }, orderBy: order, include: { contentPlacements: placements } },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Published course not found');
    const grants = studentId ? await this.prisma.studentEntitlement.findMany({ where: { studentUserId: studentId, status: EntitlementStatus.ACTIVE, revokedAt: null, startsAt: { lte: new Date() }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { courseId: true, chapterId: true } }) : [];
    const locked = (accesses: AccessType[], chapterId?: string) => {
      const effective = accesses.find((value) => value !== AccessType.INHERIT) ?? AccessType.PAID;
      if (effective === AccessType.PUBLIC) return false;
      if (effective === AccessType.FREE) return !studentId;
      return !grants.some((grant) => grant.courseId === course.id || (chapterId && grant.chapterId === chapterId));
    };
    const renderItem = (placement: any, accesses: AccessType[], chapterId?: string) => publicItem(placement, locked([placement.contentItem.accessType, ...accesses], chapterId));
    const renderSection = (section: any, accesses: AccessType[], chapterId: string) => ({ ...publicNode(section, locked([section.accessType, ...accesses], chapterId)), contentItems: section.contentPlacements.map((p: any) => renderItem(p, [section.accessType, ...accesses], chapterId)) });
    const renderLesson = (lesson: any, accesses: AccessType[], chapterId: string) => ({ ...publicNode(lesson, locked([lesson.accessType, ...accesses], chapterId)), contentItems: lesson.contentPlacements.map((p: any) => renderItem(p, [lesson.accessType, ...accesses], chapterId)), sections: lesson.sections.map((section: any) => renderSection(section, [lesson.accessType, ...accesses], chapterId)) });
    const renderChapter = (chapter: any) => ({ ...publicNode(chapter, locked([chapter.accessType, course.accessType], chapter.id)), contentItems: chapter.contentPlacements.map((p: any) => renderItem(p, [chapter.accessType, course.accessType], chapter.id)), lessons: chapter.lessons.map((lesson: any) => renderLesson(lesson, [chapter.accessType, course.accessType], chapter.id)) });
    return { ...publicNode(course, locked([course.accessType])), contentItems: course.contentPlacements.map((p: any) => renderItem(p, [course.accessType])), chapters: course.chapters.map((chapter) => renderChapter(chapter)) };
  }
}
