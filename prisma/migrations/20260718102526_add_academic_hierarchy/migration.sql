-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "AcademicGrade" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AcademicGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "academicGradeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicGrade_status_sortOrder_id_idx" ON "AcademicGrade"("status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicGrade_slug_key" ON "AcademicGrade"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicGrade_sortOrder_key" ON "AcademicGrade"("sortOrder");

-- CreateIndex
CREATE INDEX "Subject_academicGradeId_status_sortOrder_id_idx" ON "Subject"("academicGradeId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_academicGradeId_slug_key" ON "Subject"("academicGradeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_academicGradeId_sortOrder_key" ON "Subject"("academicGradeId", "sortOrder");

-- CreateIndex
CREATE INDEX "Course_subjectId_status_sortOrder_id_idx" ON "Course"("subjectId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subjectId_slug_key" ON "Course"("subjectId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_subjectId_sortOrder_key" ON "Course"("subjectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Chapter_courseId_status_sortOrder_id_idx" ON "Chapter"("courseId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_courseId_slug_key" ON "Chapter"("courseId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_courseId_sortOrder_key" ON "Chapter"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_chapterId_status_sortOrder_id_idx" ON "Lesson"("chapterId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_chapterId_slug_key" ON "Lesson"("chapterId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_chapterId_sortOrder_key" ON "Lesson"("chapterId", "sortOrder");

-- CreateIndex
CREATE INDEX "Section_lessonId_status_sortOrder_id_idx" ON "Section"("lessonId", "status", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Section_lessonId_slug_key" ON "Section"("lessonId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Section_lessonId_sortOrder_key" ON "Section"("lessonId", "sortOrder");

-- CreateIndex
CREATE INDEX "StudentProfile_academicGradeId_idx" ON "StudentProfile"("academicGradeId");

-- This project has no pre-hierarchy data. Student grades are relation-only;
-- remove the old free-text compatibility column before adding the FK.
ALTER TABLE "StudentProfile" DROP COLUMN "gradeTransitional";

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);
ALTER TABLE "Course" ADD CONSTRAINT "Course_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);
ALTER TABLE "Section" ADD CONSTRAINT "Section_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0);

ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
ALTER TABLE "Course" ADD CONSTRAINT "Course_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
ALTER TABLE "Section" ADD CONSTRAINT "Section_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL));
