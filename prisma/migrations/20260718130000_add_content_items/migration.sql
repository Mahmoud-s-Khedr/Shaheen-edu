CREATE TYPE "ContentItemType" AS ENUM ('TEXT', 'EXTERNAL_LINK', 'VIDEO', 'PDF', 'IMAGE', 'DOCUMENT', 'DOWNLOADABLE_FILE');
CREATE TYPE "ContentAccessLevel" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'ENTITLED');

CREATE TABLE "ContentItem" (
  "id" TEXT NOT NULL,
  "type" "ContentItemType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "textBody" TEXT,
  "externalUrl" TEXT,
  "accessLevel" "ContentAccessLevel" NOT NULL DEFAULT 'ENTITLED',
  "isPreview" BOOLEAN NOT NULL DEFAULT false,
  "estimatedDuration" INTEGER,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentItem_positive_values" CHECK ("version" > 0 AND ("estimatedDuration" IS NULL OR "estimatedDuration" >= 0)),
  CONSTRAINT "ContentItem_lifecycle" CHECK (("status" = 'DRAFT' AND "publishedAt" IS NULL AND "archivedAt" IS NULL) OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "archivedAt" IS NULL) OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL))
);

CREATE TABLE "ContentPlacement" (
  "id" TEXT NOT NULL,
  "contentItemId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "lessonId" TEXT,
  "sectionId" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentPlacement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentPlacement_one_target" CHECK ((CASE WHEN "courseId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "chapterId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "lessonId" IS NULL THEN 0 ELSE 1 END + CASE WHEN "sectionId" IS NULL THEN 0 ELSE 1 END) = 1),
  CONSTRAINT "ContentPlacement_positive_values" CHECK ("sortOrder" > 0 AND "version" > 0)
);

CREATE UNIQUE INDEX "ContentPlacement_contentItemId_key" ON "ContentPlacement"("contentItemId");
CREATE UNIQUE INDEX "ContentPlacement_course_sortOrder_key" ON "ContentPlacement"("courseId", "sortOrder") WHERE "courseId" IS NOT NULL;
CREATE UNIQUE INDEX "ContentPlacement_chapter_sortOrder_key" ON "ContentPlacement"("chapterId", "sortOrder") WHERE "chapterId" IS NOT NULL;
CREATE UNIQUE INDEX "ContentPlacement_lesson_sortOrder_key" ON "ContentPlacement"("lessonId", "sortOrder") WHERE "lessonId" IS NOT NULL;
CREATE UNIQUE INDEX "ContentPlacement_section_sortOrder_key" ON "ContentPlacement"("sectionId", "sortOrder") WHERE "sectionId" IS NOT NULL;
CREATE INDEX "ContentItem_status_createdAt_id_idx" ON "ContentItem"("status", "createdAt", "id");
CREATE INDEX "ContentPlacement_courseId_sortOrder_id_idx" ON "ContentPlacement"("courseId", "sortOrder", "id");
CREATE INDEX "ContentPlacement_chapterId_sortOrder_id_idx" ON "ContentPlacement"("chapterId", "sortOrder", "id");
CREATE INDEX "ContentPlacement_lessonId_sortOrder_id_idx" ON "ContentPlacement"("lessonId", "sortOrder", "id");
CREATE INDEX "ContentPlacement_sectionId_sortOrder_id_idx" ON "ContentPlacement"("sectionId", "sortOrder", "id");

ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
