CREATE TYPE "QuestionSourceType" AS ENUM ('PLATFORM', 'CONTENT_PUBLISHER', 'EXTERNAL_BOOK', 'PREVIOUS_EXAM', 'MINISTRY_MODEL');
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE');

CREATE TABLE "QuestionSource" (
  "id" TEXT NOT NULL, "type" "QuestionSourceType" NOT NULL, "title" TEXT NOT NULL, "note" TEXT,
  "publisherUserId" TEXT, "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  CONSTRAINT "QuestionSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionSource_publisher_for_content_publisher" CHECK (("type" = 'CONTENT_PUBLISHER' AND "publisherUserId" IS NOT NULL) OR ("type" <> 'CONTENT_PUBLISHER' AND "publisherUserId" IS NULL))
);
CREATE TABLE "QuestionBank" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL,
  CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Question" (
  "id" TEXT NOT NULL, "bankId" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "chapterId" TEXT NOT NULL,
  "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE', "body" TEXT NOT NULL, "explanation" TEXT,
  "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT', "reviewNote" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "updatedById" TEXT NOT NULL, "reviewedById" TEXT,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuestionOption" (
  "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "body" TEXT NOT NULL, "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id"), CONSTRAINT "QuestionOption_questionId_sortOrder_key" UNIQUE ("questionId", "sortOrder")
);
CREATE TABLE "QuestionAsset" (
  "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "QuestionAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuestionAsset_questionId_assetId_key" UNIQUE ("questionId", "assetId"), CONSTRAINT "QuestionAsset_questionId_sortOrder_key" UNIQUE ("questionId", "sortOrder")
);
CREATE TABLE "QuestionVideoLink" (
  "id" TEXT NOT NULL, "questionId" TEXT NOT NULL, "videoAssetId" TEXT NOT NULL, "timestampSeconds" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionVideoLink_pkey" PRIMARY KEY ("id"), CONSTRAINT "QuestionVideoLink_questionId_key" UNIQUE ("questionId"),
  CONSTRAINT "QuestionVideoLink_timestamp_nonnegative" CHECK ("timestampSeconds" >= 0)
);
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_publisherUserId_fkey" FOREIGN KEY ("publisherUserId") REFERENCES "PartnerProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionSource" ADD CONSTRAINT "QuestionSource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "QuestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionAsset" ADD CONSTRAINT "QuestionAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionVideoLink" ADD CONSTRAINT "QuestionVideoLink_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionVideoLink" ADD CONSTRAINT "QuestionVideoLink_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "QuestionSource_status_type_createdAt_id_idx" ON "QuestionSource"("status", "type", "createdAt", "id");
CREATE INDEX "QuestionSource_publisherUserId_idx" ON "QuestionSource"("publisherUserId");
CREATE INDEX "QuestionBank_status_createdAt_id_idx" ON "QuestionBank"("status", "createdAt", "id");
CREATE INDEX "Question_status_createdAt_id_idx" ON "Question"("status", "createdAt", "id");
CREATE INDEX "Question_bankId_status_idx" ON "Question"("bankId", "status");
CREATE INDEX "Question_sourceId_status_idx" ON "Question"("sourceId", "status");
CREATE INDEX "Question_chapterId_status_idx" ON "Question"("chapterId", "status");
CREATE INDEX "QuestionVideoLink_videoAssetId_idx" ON "QuestionVideoLink"("videoAssetId");
