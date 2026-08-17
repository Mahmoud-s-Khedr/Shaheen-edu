ALTER TYPE "QuestionImportStatus" ADD VALUE IF NOT EXISTS 'TRANSCRIBING';
CREATE TYPE "QuestionImportPageStatus" AS ENUM ('PENDING', 'AI_TRANSCRIBED', 'REVIEW_REQUIRED', 'FAILED');

CREATE TABLE "QuestionImportPage" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "status" "QuestionImportPageStatus" NOT NULL DEFAULT 'PENDING',
  "aiText" TEXT,
  "canonicalText" TEXT,
  "confidence" DOUBLE PRECISION,
  "uncertainSpans" JSONB,
  "warnings" JSONB,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerFileId" TEXT,
  "rawProviderResponse" JSONB,
  "usage" JSONB,
  "errorDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionImportPage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportPage_batchId_pageNumber_key" ON "QuestionImportPage"("batchId", "pageNumber");
CREATE INDEX "QuestionImportPage_batchId_status_idx" ON "QuestionImportPage"("batchId", "status");
ALTER TABLE "QuestionImportPage" ADD CONSTRAINT "QuestionImportPage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
