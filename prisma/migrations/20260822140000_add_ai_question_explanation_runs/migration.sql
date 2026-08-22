CREATE TYPE "QuestionAiExplanationRunMode" AS ENUM ('INFER', 'GROUNDED');
CREATE TYPE "QuestionAiExplanationRunStatus" AS ENUM ('PENDING_REVIEW', 'APPLIED', 'REJECTED', 'FAILED');

ALTER TABLE "Question"
  ADD COLUMN "replacesQuestionId" TEXT;

ALTER TABLE "QuestionExplanation"
  ADD COLUMN "sourceFingerprint" TEXT,
  ADD COLUMN "staleAt" TIMESTAMP(3);

CREATE TABLE "QuestionAiExplanationRun" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "mode" "QuestionAiExplanationRunMode" NOT NULL,
  "status" "QuestionAiExplanationRunStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "questionSnapshot" JSONB NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL DEFAULT 'ar',
  "suppliedAnswer" JSONB,
  "additionalContext" TEXT,
  "proposedAnswer" JSONB,
  "structuredExplanation" JSONB,
  "confidence" DOUBLE PRECISION,
  "warnings" JSONB,
  "conflictWarning" TEXT,
  "model" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "rawResponse" JSONB,
  "usage" JSONB,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "applyAnswer" BOOLEAN,
  "applyExplanation" BOOLEAN,
  "appliedQuestionId" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionAiExplanationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Question_replacesQuestionId_idx" ON "Question"("replacesQuestionId");
CREATE INDEX "QuestionAiExplanationRun_questionId_createdAt_idx" ON "QuestionAiExplanationRun"("questionId", "createdAt");
CREATE INDEX "QuestionAiExplanationRun_status_createdAt_idx" ON "QuestionAiExplanationRun"("status", "createdAt");
ALTER TABLE "Question" ADD CONSTRAINT "Question_replacesQuestionId_fkey"
  FOREIGN KEY ("replacesQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionAiExplanationRun" ADD CONSTRAINT "QuestionAiExplanationRun_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
