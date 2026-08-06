ALTER TABLE "ContentPlacement"
  ADD COLUMN "academicGradeId" TEXT,
  ADD COLUMN "subjectId" TEXT,
  ADD COLUMN "resolvedCourseId" TEXT,
  ADD COLUMN "resolvedChapterId" TEXT,
  ADD COLUMN "resolvedLessonId" TEXT,
  ADD COLUMN "resolvedSectionId" TEXT;

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

ALTER TABLE "ContentPlacement"
  ALTER COLUMN "academicGradeId" SET NOT NULL,
  ALTER COLUMN "subjectId" SET NOT NULL,
  ALTER COLUMN "resolvedCourseId" SET NOT NULL;

CREATE INDEX "ContentPlacement_subjectId_resolvedCourseId_resolvedChapterId_idx"
  ON "ContentPlacement"("subjectId", "resolvedCourseId", "resolvedChapterId");
CREATE INDEX "ContentPlacement_academicGradeId_subjectId_idx"
  ON "ContentPlacement"("academicGradeId", "subjectId");
