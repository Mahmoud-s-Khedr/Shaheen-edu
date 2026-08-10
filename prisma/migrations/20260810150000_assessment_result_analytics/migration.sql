-- Immutable labels for analytics on assessments created after this migration.
CREATE TABLE "AssessmentQuestionPlacement" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectTitle" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterTitle" TEXT,
    "lessonId" TEXT,
    "lessonTitle" TEXT,
    "sectionId" TEXT,
    "sectionTitle" TEXT,

    CONSTRAINT "AssessmentQuestionPlacement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AssessmentAttemptAnswer" ADD COLUMN "activeSeconds" INTEGER NOT NULL DEFAULT 0;

-- Assessments created before this migration only retained a source-question ID.
-- Reconstruct placement snapshots from the hierarchy at migration time so their
-- completed attempts remain visible in the new analytics endpoints. These rows
-- are intentionally a best-effort historical backfill; newly created snapshots
-- are immutable at assessment creation time.
INSERT INTO "AssessmentQuestionPlacement" (
  "id", "assessmentQuestionId", "subjectId", "subjectTitle",
  "courseId", "courseTitle", "chapterId", "chapterTitle",
  "lessonId", "lessonTitle", "sectionId", "sectionTitle"
)
SELECT
  'backfill_' || aq."id" || '_' || qp."id",
  aq."id",
  subject."id", subject."title",
  course."id", course."title",
  chapter."id", chapter."title",
  lesson."id", lesson."title",
  section."id", section."title"
FROM "AssessmentQuestion" aq
JOIN "QuestionPlacement" qp ON qp."questionId" = aq."sourceQuestionId"
LEFT JOIN "Section" section ON section."id" = qp."sectionId"
LEFT JOIN "Lesson" direct_lesson ON direct_lesson."id" = qp."lessonId"
LEFT JOIN "Lesson" section_lesson ON section_lesson."id" = section."lessonId"
LEFT JOIN "Chapter" direct_chapter ON direct_chapter."id" = qp."chapterId"
LEFT JOIN "Chapter" lesson_chapter ON lesson_chapter."id" = COALESCE(direct_lesson."chapterId", section_lesson."chapterId")
LEFT JOIN "Course" direct_course ON direct_course."id" = qp."courseId"
LEFT JOIN "Course" chapter_course ON chapter_course."id" = COALESCE(direct_chapter."courseId", lesson_chapter."courseId")
JOIN "Course" course ON course."id" = COALESCE(direct_course."id", chapter_course."id")
JOIN "Subject" subject ON subject."id" = course."subjectId"
LEFT JOIN "Chapter" chapter ON chapter."id" = COALESCE(direct_chapter."id", lesson_chapter."id")
LEFT JOIN "Lesson" lesson ON lesson."id" = COALESCE(direct_lesson."id", section_lesson."id")
WHERE NOT EXISTS (
  SELECT 1
  FROM "AssessmentQuestionPlacement" existing
  WHERE existing."assessmentQuestionId" = aq."id"
    AND existing."id" = 'backfill_' || aq."id" || '_' || qp."id"
);

CREATE INDEX "AssessmentQuestionPlacement_assessmentQuestionId_idx" ON "AssessmentQuestionPlacement"("assessmentQuestionId");
CREATE INDEX "AssessmentQuestionPlacement_subjectId_idx" ON "AssessmentQuestionPlacement"("subjectId");
CREATE INDEX "AssessmentQuestionPlacement_chapterId_idx" ON "AssessmentQuestionPlacement"("chapterId");
CREATE INDEX "AssessmentScope_chapterId_assessmentId_idx" ON "AssessmentScope"("chapterId", "assessmentId");
CREATE INDEX "AssessmentAttempt_assessmentId_status_studentUserId_idx" ON "AssessmentAttempt"("assessmentId", "status", "studentUserId");

ALTER TABLE "AssessmentQuestionPlacement"
  ADD CONSTRAINT "AssessmentQuestionPlacement_assessmentQuestionId_fkey"
  FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
