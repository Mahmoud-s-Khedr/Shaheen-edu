/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { contentPlacementAncestry } from './content-placement-ancestry.helper';

describe('contentPlacementAncestry', () => {
  const updateMany = jest.fn();
  const tx = { contentPlacement: { updateMany } } as any;

  beforeEach(() => updateMany.mockReset());

  it('updates copied grade ancestry for every placement under a moved subject', async () => {
    await contentPlacementAncestry.subjectMoved(tx, 'subject-1', 'grade-2');

    expect(updateMany).toHaveBeenCalledWith({
      where: { subjectId: 'subject-1' },
      data: { academicGradeId: 'grade-2' },
    });
  });

  it('updates all placements resolved below a moved course', async () => {
    await contentPlacementAncestry.courseMoved(tx, 'course-1', {
      academicGradeId: 'grade-2',
      subjectId: 'subject-2',
      courseId: 'course-1',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { resolvedCourseId: 'course-1' },
      data: { academicGradeId: 'grade-2', subjectId: 'subject-2' },
    });
  });

  it('updates changed ancestors at each descendant move boundary', async () => {
    const ancestry = {
      academicGradeId: 'grade-2',
      subjectId: 'subject-2',
      courseId: 'course-2',
      chapterId: 'chapter-2',
      lessonId: 'lesson-2',
    };

    await contentPlacementAncestry.chapterMoved(tx, 'chapter-1', ancestry);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { resolvedChapterId: 'chapter-1' },
      data: {
        academicGradeId: 'grade-2',
        subjectId: 'subject-2',
        resolvedCourseId: 'course-2',
      },
    });

    await contentPlacementAncestry.lessonMoved(tx, 'lesson-1', ancestry);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { resolvedLessonId: 'lesson-1' },
      data: {
        academicGradeId: 'grade-2',
        subjectId: 'subject-2',
        resolvedCourseId: 'course-2',
        resolvedChapterId: 'chapter-2',
      },
    });

    await contentPlacementAncestry.sectionMoved(tx, 'section-1', ancestry);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { resolvedSectionId: 'section-1' },
      data: {
        academicGradeId: 'grade-2',
        subjectId: 'subject-2',
        resolvedCourseId: 'course-2',
        resolvedChapterId: 'chapter-2',
        resolvedLessonId: 'lesson-2',
      },
    });
  });
});
