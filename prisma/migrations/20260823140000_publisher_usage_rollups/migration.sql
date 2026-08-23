CREATE TYPE "PublisherUsageScope" AS ENUM (
  'ALL', 'SUBJECT', 'COURSE', 'CHAPTER', 'LESSON', 'SECTION'
);

CREATE TABLE "PublisherUsageDailyRollup" (
  "id" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "publisherUserId" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "sourceTitle" TEXT,
  "scope" "PublisherUsageScope" NOT NULL,
  "scopeId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "subjectId" TEXT,
  "courseId" TEXT,
  "chapterId" TEXT,
  "lessonId" TEXT,
  "sectionId" TEXT,
  "presented" INTEGER NOT NULL DEFAULT 0,
  "solved" INTEGER NOT NULL DEFAULT 0,
  "uniqueSolvers" INTEGER NOT NULL DEFAULT 0,
  "graded" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "reattempts" INTEGER NOT NULL DEFAULT 0,
  "inputUpdatedAt" TIMESTAMP(3) NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublisherUsageDailyRollup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublisherUsageDailyRollup_publisherUserId_fkey"
    FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PublisherUsageDailyRollup_usageDate_publisherUserId_sourceKey_scopeKey_key"
  ON "PublisherUsageDailyRollup"("usageDate", "publisherUserId", "sourceKey", "scopeKey");
CREATE INDEX "PublisherUsageDailyRollup_publisherUserId_usageDate_scope_scopeId_idx"
  ON "PublisherUsageDailyRollup"("publisherUserId", "usageDate", "scope", "scopeId");
CREATE INDEX "PublisherUsageDailyRollup_publisherUserId_sourceKey_usageDate_idx"
  ON "PublisherUsageDailyRollup"("publisherUserId", "sourceKey", "usageDate");

CREATE TABLE "PublisherUsageDailySolver" (
  "id" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "publisherUserId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "studentFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublisherUsageDailySolver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublisherUsageDailySolver_publisherUserId_fkey"
    FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PublisherUsageDailySolver_usageDate_publisherUserId_sourceKey_scopeKey_studentFingerprint_key"
  ON "PublisherUsageDailySolver"("usageDate", "publisherUserId", "sourceKey", "scopeKey", "studentFingerprint");
CREATE INDEX "PublisherUsageDailySolver_publisherUserId_sourceKey_scopeKey_usageDate_idx"
  ON "PublisherUsageDailySolver"("publisherUserId", "sourceKey", "scopeKey", "usageDate");
