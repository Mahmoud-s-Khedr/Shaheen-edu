ALTER TYPE "QuestionImportStatus" ADD VALUE IF NOT EXISTS 'SEGMENTING';
ALTER TYPE "QuestionImportStatus" ADD VALUE IF NOT EXISTS 'AWAITING_REVIEW';

ALTER TABLE "QuestionImportBatch"
  ADD COLUMN "segmentationRawOutput" JSONB,
  ADD COLUMN "segmentationUsage" JSONB,
  ADD COLUMN "segmentationWarnings" JSONB,
  ADD COLUMN "sourceTextEditedAt" TIMESTAMP(3);

CREATE TABLE "QuestionImportSourceBlock" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "blockKey" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "sourceLocator" JSONB,
  "assignment" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionImportSourceBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportSourceBlock_batchId_sequence_key" ON "QuestionImportSourceBlock"("batchId", "sequence");
CREATE UNIQUE INDEX "QuestionImportSourceBlock_batchId_blockKey_key" ON "QuestionImportSourceBlock"("batchId", "blockKey");
CREATE INDEX "QuestionImportSourceBlock_batchId_idx" ON "QuestionImportSourceBlock"("batchId");
ALTER TABLE "QuestionImportSourceBlock" ADD CONSTRAINT "QuestionImportSourceBlock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
