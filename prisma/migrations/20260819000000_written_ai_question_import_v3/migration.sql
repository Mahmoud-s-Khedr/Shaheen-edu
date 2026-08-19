CREATE TABLE "QuestionImportAnswerEvidence" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "evidenceKey" TEXT NOT NULL,
    "firstBlock" TEXT NOT NULL,
    "lastBlock" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceLocator" JSONB,
    "questionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImportAnswerEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportAnswerEvidence_batchId_evidenceKey_key"
ON "QuestionImportAnswerEvidence"("batchId", "evidenceKey");
CREATE INDEX "QuestionImportAnswerEvidence_batchId_idx"
ON "QuestionImportAnswerEvidence"("batchId");
ALTER TABLE "QuestionImportAnswerEvidence"
ADD CONSTRAINT "QuestionImportAnswerEvidence_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionImportItem"
  ADD COLUMN "citedEvidenceKeys" JSONB,
  ADD COLUMN "reviewerCandidate" JSONB,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNote" TEXT;

ALTER TABLE "QuestionImportItem"
  ALTER COLUMN "answerOrigin" TYPE "QuestionAnswerProvenance"
  USING CASE "answerOrigin"::text
    WHEN 'EXPLICIT' THEN 'SOURCE_MARKED'::"QuestionAnswerProvenance"
    WHEN 'INFERRED' THEN 'AI_INFERRED'::"QuestionAnswerProvenance"
    ELSE NULL
  END;
