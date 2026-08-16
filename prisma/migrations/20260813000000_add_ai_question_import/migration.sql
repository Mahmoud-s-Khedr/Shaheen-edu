CREATE TYPE "QuestionImportInputType" AS ENUM ('RAW_TEXT', 'ASSET');
CREATE TYPE "QuestionImportStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'GENERATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');
CREATE TYPE "QuestionImportChunkStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "QuestionImportItemStatus" AS ENUM ('CREATED', 'INVALID', 'FAILED');

CREATE TABLE "QuestionImportBatch" (
  "id" TEXT NOT NULL,
  "inputType" "QuestionImportInputType" NOT NULL,
  "rawText" TEXT,
  "sourceAssetId" TEXT,
  "bankId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "placements" JSONB NOT NULL,
  "status" "QuestionImportStatus" NOT NULL DEFAULT 'QUEUED',
  "normalizedText" TEXT,
  "extractionMetadata" JSONB,
  "errorSummary" TEXT,
  "model" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "totalChunks" INTEGER NOT NULL DEFAULT 0,
  "completedChunks" INTEGER NOT NULL DEFAULT 0,
  "totalItems" INTEGER NOT NULL DEFAULT 0,
  "createdQuestions" INTEGER NOT NULL DEFAULT 0,
  "invalidItems" INTEGER NOT NULL DEFAULT 0,
  "failedItems" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  CONSTRAINT "QuestionImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionImportChunk" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "sourceLocator" JSONB,
  "checksum" TEXT NOT NULL,
  "status" "QuestionImportChunkStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "rawResponse" JSONB,
  "usage" JSONB,
  "errorDetail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "QuestionImportChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionImportItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "chunkId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "QuestionImportItemStatus" NOT NULL,
  "rawOutput" JSONB,
  "normalizedOutput" JSONB,
  "confidence" DOUBLE PRECISION,
  "warnings" JSONB,
  "sourceLocator" JSONB,
  "errorDetail" TEXT,
  "questionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionImportItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportChunk_batchId_sequence_key" ON "QuestionImportChunk"("batchId", "sequence");
CREATE INDEX "QuestionImportChunk_batchId_status_idx" ON "QuestionImportChunk"("batchId", "status");
CREATE UNIQUE INDEX "QuestionImportItem_questionId_key" ON "QuestionImportItem"("questionId");
CREATE UNIQUE INDEX "QuestionImportItem_chunkId_sequence_key" ON "QuestionImportItem"("chunkId", "sequence");
CREATE INDEX "QuestionImportItem_batchId_status_idx" ON "QuestionImportItem"("batchId", "status");
CREATE INDEX "QuestionImportBatch_status_createdAt_idx" ON "QuestionImportBatch"("status", "createdAt");
CREATE INDEX "QuestionImportBatch_createdById_createdAt_idx" ON "QuestionImportBatch"("createdById", "createdAt");

ALTER TABLE "QuestionImportBatch" ADD CONSTRAINT "QuestionImportBatch_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionImportBatch" ADD CONSTRAINT "QuestionImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionImportChunk" ADD CONSTRAINT "QuestionImportChunk_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "QuestionImportChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportItem" ADD CONSTRAINT "QuestionImportItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
