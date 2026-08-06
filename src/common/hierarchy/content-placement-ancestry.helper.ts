import type { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

type ResolvedAncestry = {
  academicGradeId: string;
  subjectId: string;
  courseId: string;
  chapterId?: string;
  lessonId?: string;
};

/**
 * ContentPlacement stores a query-optimized copy of its hierarchy ancestry.
 * Keep that copy in sync whenever a hierarchy node changes parent.
 */
export const contentPlacementAncestry = {
  subjectMoved(
    tx: TransactionClient,
    subjectId: string,
    academicGradeId: string,
  ) {
    return tx.contentPlacement.updateMany({
      where: { subjectId },
      data: { academicGradeId },
    });
  },

  courseMoved(
    tx: TransactionClient,
    courseId: string,
    ancestry: ResolvedAncestry,
  ) {
    return tx.contentPlacement.updateMany({
      where: { resolvedCourseId: courseId },
      data: {
        academicGradeId: ancestry.academicGradeId,
        subjectId: ancestry.subjectId,
      },
    });
  },

  chapterMoved(
    tx: TransactionClient,
    chapterId: string,
    ancestry: ResolvedAncestry,
  ) {
    return tx.contentPlacement.updateMany({
      where: { resolvedChapterId: chapterId },
      data: {
        academicGradeId: ancestry.academicGradeId,
        subjectId: ancestry.subjectId,
        resolvedCourseId: ancestry.courseId,
      },
    });
  },

  lessonMoved(
    tx: TransactionClient,
    lessonId: string,
    ancestry: ResolvedAncestry,
  ) {
    return tx.contentPlacement.updateMany({
      where: { resolvedLessonId: lessonId },
      data: {
        academicGradeId: ancestry.academicGradeId,
        subjectId: ancestry.subjectId,
        resolvedCourseId: ancestry.courseId,
        resolvedChapterId: ancestry.chapterId,
      },
    });
  },

  sectionMoved(
    tx: TransactionClient,
    sectionId: string,
    ancestry: ResolvedAncestry,
  ) {
    return tx.contentPlacement.updateMany({
      where: { resolvedSectionId: sectionId },
      data: {
        academicGradeId: ancestry.academicGradeId,
        subjectId: ancestry.subjectId,
        resolvedCourseId: ancestry.courseId,
        resolvedChapterId: ancestry.chapterId,
        resolvedLessonId: ancestry.lessonId,
      },
    });
  },
};
