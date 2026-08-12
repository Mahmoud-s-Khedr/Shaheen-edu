-- Preserve the existing single-bank column during the transition while adding
-- a canonical relation for assessments generated from multiple banks.
CREATE TABLE "AssessmentQuestionBank" (
  "assessmentId" TEXT NOT NULL,
  "questionBankId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentQuestionBank_pkey" PRIMARY KEY ("assessmentId", "questionBankId")
);

CREATE INDEX "AssessmentQuestionBank_questionBankId_idx"
  ON "AssessmentQuestionBank"("questionBankId");

ALTER TABLE "AssessmentQuestionBank"
  ADD CONSTRAINT "AssessmentQuestionBank_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentQuestionBank"
  ADD CONSTRAINT "AssessmentQuestionBank_questionBankId_fkey"
  FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AssessmentQuestionBank" ("assessmentId", "questionBankId")
SELECT "id", "questionBankId"
FROM "Assessment"
WHERE "questionBankId" IS NOT NULL;
