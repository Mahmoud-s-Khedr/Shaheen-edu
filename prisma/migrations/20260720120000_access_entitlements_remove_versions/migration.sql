CREATE TYPE "AccessType" AS ENUM ('PUBLIC', 'FREE', 'PAID', 'INHERIT');
CREATE TYPE "EntitlementSource" AS ENUM ('ADMIN', 'PROMOTION', 'MIGRATION', 'PAYMENT');
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "Course" ADD COLUMN "accessType" "AccessType" NOT NULL DEFAULT 'PAID';
ALTER TABLE "Chapter" ADD COLUMN "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT';
ALTER TABLE "Lesson" ADD COLUMN "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT';
ALTER TABLE "Section" ADD COLUMN "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT';
ALTER TABLE "ContentItem" ADD COLUMN "accessType" "AccessType" NOT NULL DEFAULT 'INHERIT';

UPDATE "ContentItem"
SET "accessType" = CASE "accessLevel"
  WHEN 'PUBLIC' THEN 'PUBLIC'::"AccessType"
  WHEN 'AUTHENTICATED' THEN 'FREE'::"AccessType"
  ELSE 'PAID'::"AccessType"
END;

ALTER TABLE "ContentItem" DROP COLUMN "accessLevel", DROP COLUMN "isPreview", DROP COLUMN "version";
ALTER TABLE "ContentPlacement" DROP COLUMN "version";
ALTER TABLE "AcademicGrade" DROP COLUMN "version";
ALTER TABLE "Subject" DROP COLUMN "version";
ALTER TABLE "Course" DROP COLUMN "version";
ALTER TABLE "Chapter" DROP COLUMN "version";
ALTER TABLE "Lesson" DROP COLUMN "version";
ALTER TABLE "Section" DROP COLUMN "version";

ALTER TABLE "AcademicGrade" DROP CONSTRAINT "AcademicGrade_positive_values";
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_positive_values";
ALTER TABLE "Course" DROP CONSTRAINT "Course_positive_values";
ALTER TABLE "Chapter" DROP CONSTRAINT "Chapter_positive_values";
ALTER TABLE "Lesson" DROP CONSTRAINT "Lesson_positive_values";
ALTER TABLE "Section" DROP CONSTRAINT "Section_positive_values";
ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_positive_values";
ALTER TABLE "ContentPlacement" DROP CONSTRAINT "ContentPlacement_positive_values";
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "Course" ADD CONSTRAINT "Course_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "Section" ADD CONSTRAINT "Section_positive_values" CHECK ("sortOrder" > 0);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_positive_values" CHECK ("estimatedDuration" IS NULL OR "estimatedDuration" >= 0);
ALTER TABLE "ContentPlacement" ADD CONSTRAINT "ContentPlacement_positive_values" CHECK ("sortOrder" > 0);

CREATE TABLE "StudentEntitlement" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "source" "EntitlementSource" NOT NULL DEFAULT 'ADMIN',
  "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "grantedById" TEXT NOT NULL,
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentEntitlement_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int = 1)
);
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentEntitlement" ADD CONSTRAINT "StudentEntitlement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "StudentEntitlement_studentUserId_status_startsAt_expiresAt_idx" ON "StudentEntitlement"("studentUserId", "status", "startsAt", "expiresAt");
CREATE INDEX "StudentEntitlement_courseId_idx" ON "StudentEntitlement"("courseId");
CREATE INDEX "StudentEntitlement_chapterId_idx" ON "StudentEntitlement"("chapterId");
