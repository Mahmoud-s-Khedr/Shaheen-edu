CREATE TYPE "PublisherAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

ALTER TABLE "Course" ADD COLUMN "priceMinor" INTEGER,
ADD COLUMN "currency" TEXT,
ADD COLUMN "isPurchasable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Chapter" ADD COLUMN "priceMinor" INTEGER,
ADD COLUMN "currency" TEXT,
ADD COLUMN "isPurchasable" BOOLEAN;
ALTER TABLE "Lesson" ADD COLUMN "priceMinor" INTEGER,
ADD COLUMN "currency" TEXT,
ADD COLUMN "isPurchasable" BOOLEAN;

CREATE TABLE "PublisherAgreement" (
  "id" TEXT NOT NULL,
  "publisherUserId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "lessonId" TEXT,
  "revenueShareBps" INTEGER NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" "PublisherAgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublisherAgreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublisherAgreement_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int + ("lessonId" IS NOT NULL)::int = 1)
);
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherAgreement" ADD CONSTRAINT "PublisherAgreement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PublisherAgreement_courseId_status_isPrimary_startsAt_endsAt_idx" ON "PublisherAgreement"("courseId", "status", "isPrimary", "startsAt", "endsAt");
CREATE INDEX "PublisherAgreement_chapterId_status_isPrimary_startsAt_endsAt_idx" ON "PublisherAgreement"("chapterId", "status", "isPrimary", "startsAt", "endsAt");
CREATE INDEX "PublisherAgreement_lessonId_status_isPrimary_startsAt_endsAt_idx" ON "PublisherAgreement"("lessonId", "status", "isPrimary", "startsAt", "endsAt");

CREATE TABLE "PublisherEarningsStatement" (
  "id" TEXT NOT NULL,
  "agreementId" TEXT NOT NULL,
  "courseId" TEXT,
  "chapterId" TEXT,
  "lessonId" TEXT,
  "periodStartsAt" TIMESTAMP(3) NOT NULL,
  "periodEndsAt" TIMESTAMP(3) NOT NULL,
  "grossRevenueMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "revenueShareBps" INTEGER NOT NULL,
  "publisherEarningsMinor" INTEGER NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublisherEarningsStatement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublisherEarningsStatement_exactly_one_target" CHECK (("courseId" IS NOT NULL)::int + ("chapterId" IS NOT NULL)::int + ("lessonId" IS NOT NULL)::int = 1)
);
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "PublisherAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherEarningsStatement" ADD CONSTRAINT "PublisherEarningsStatement_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PublisherEarningsStatement_agreementId_periodStartsAt_periodEndsAt_idx" ON "PublisherEarningsStatement"("agreementId", "periodStartsAt", "periodEndsAt");
