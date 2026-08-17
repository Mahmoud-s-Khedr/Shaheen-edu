CREATE TABLE "QuestionImportSkippedRange" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "firstBlock" TEXT NOT NULL,
  "lastBlock" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceLocator" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionImportSkippedRange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportSkippedRange_batchId_sequence_key" ON "QuestionImportSkippedRange"("batchId", "sequence");
CREATE INDEX "QuestionImportSkippedRange_batchId_idx" ON "QuestionImportSkippedRange"("batchId");
ALTER TABLE "QuestionImportSkippedRange" ADD CONSTRAINT "QuestionImportSkippedRange_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
