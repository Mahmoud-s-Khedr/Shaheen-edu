-- A Subject is reusable; SubjectGrade holds its ordered membership in a grade.
CREATE TABLE "SubjectGrade" (
    "id" TEXT NOT NULL,
    "academicGradeId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubjectGrade_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SubjectGrade" ("id", "academicGradeId", "subjectId", "sortOrder", "createdAt", "updatedAt")
SELECT
    'subject_grade_' || md5(s."id" || s."academicGradeId"),
    s."academicGradeId",
    s."id",
    s."sortOrder",
    s."createdAt",
    s."updatedAt"
FROM "Subject" s;

ALTER TABLE "Course" ADD COLUMN "academicGradeId" TEXT;
UPDATE "Course" c
SET "academicGradeId" = s."academicGradeId"
FROM "Subject" s
WHERE s."id" = c."subjectId";

DROP INDEX "Course_subjectId_slug_key";
DROP INDEX "Course_subjectId_sortOrder_key";
DROP INDEX "Course_subjectId_status_sortOrder_id_idx";

CREATE UNIQUE INDEX "SubjectGrade_academicGradeId_subjectId_key" ON "SubjectGrade"("academicGradeId", "subjectId");
CREATE UNIQUE INDEX "SubjectGrade_academicGradeId_sortOrder_key" ON "SubjectGrade"("academicGradeId", "sortOrder");
CREATE INDEX "SubjectGrade_subjectId_idx" ON "SubjectGrade"("subjectId");
CREATE UNIQUE INDEX "Course_subjectId_academicGradeId_slug_key" ON "Course"("subjectId", "academicGradeId", "slug");
CREATE UNIQUE INDEX "Course_subjectId_academicGradeId_sortOrder_key" ON "Course"("subjectId", "academicGradeId", "sortOrder");
CREATE INDEX "Course_academicGradeId_subjectId_status_sortOrder_id_idx" ON "Course"("academicGradeId", "subjectId", "status", "sortOrder", "id");

ALTER TABLE "SubjectGrade" ADD CONSTRAINT "SubjectGrade_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectGrade" ADD CONSTRAINT "SubjectGrade_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
