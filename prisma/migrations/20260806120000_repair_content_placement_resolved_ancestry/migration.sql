-- Recompute copied hierarchy values after deployments that allowed hierarchy
-- nodes to move without updating their existing content placements.
UPDATE "ContentPlacement" p
SET
  "academicGradeId" = g.id,
  "subjectId" = s.id,
  "resolvedCourseId" = c.id,
  "resolvedChapterId" = h.id,
  "resolvedLessonId" = l.id,
  "resolvedSectionId" = x.id
FROM "Section" x
JOIN "Lesson" l ON l.id = x."lessonId"
JOIN "Chapter" h ON h.id = l."chapterId"
JOIN "Course" c ON c.id = h."courseId"
JOIN "Subject" s ON s.id = c."subjectId"
JOIN "AcademicGrade" g ON g.id = s."academicGradeId"
WHERE p."sectionId" = x.id;

UPDATE "ContentPlacement" p
SET
  "academicGradeId" = g.id,
  "subjectId" = s.id,
  "resolvedCourseId" = c.id,
  "resolvedChapterId" = h.id,
  "resolvedLessonId" = l.id,
  "resolvedSectionId" = NULL
FROM "Lesson" l
JOIN "Chapter" h ON h.id = l."chapterId"
JOIN "Course" c ON c.id = h."courseId"
JOIN "Subject" s ON s.id = c."subjectId"
JOIN "AcademicGrade" g ON g.id = s."academicGradeId"
WHERE p."lessonId" = l.id;

UPDATE "ContentPlacement" p
SET
  "academicGradeId" = g.id,
  "subjectId" = s.id,
  "resolvedCourseId" = c.id,
  "resolvedChapterId" = h.id,
  "resolvedLessonId" = NULL,
  "resolvedSectionId" = NULL
FROM "Chapter" h
JOIN "Course" c ON c.id = h."courseId"
JOIN "Subject" s ON s.id = c."subjectId"
JOIN "AcademicGrade" g ON g.id = s."academicGradeId"
WHERE p."chapterId" = h.id;

UPDATE "ContentPlacement" p
SET
  "academicGradeId" = g.id,
  "subjectId" = s.id,
  "resolvedCourseId" = c.id,
  "resolvedChapterId" = NULL,
  "resolvedLessonId" = NULL,
  "resolvedSectionId" = NULL
FROM "Course" c
JOIN "Subject" s ON s.id = c."subjectId"
JOIN "AcademicGrade" g ON g.id = s."academicGradeId"
WHERE p."courseId" = c.id;
