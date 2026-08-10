-- Question banks are subject-scoped. Backfill only unambiguous legacy data.
-- Empty and mixed-subject banks remain nullable until the remediation script
-- has received explicit operator mappings; do not make this deployment fail.
ALTER TABLE "QuestionBank" ADD COLUMN "subjectId" TEXT;

UPDATE "QuestionBank" bank
SET "subjectId" = source."subjectId"
FROM (
  SELECT q."bankId", MIN(c."subjectId") AS "subjectId"
  FROM "Question" q
  JOIN "Course" c ON c.id = q."courseId"
  GROUP BY q."bankId"
  HAVING COUNT(DISTINCT c."subjectId") = 1
) source
WHERE bank.id = source."bankId";

ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "QuestionBank_subjectId_status_idx" ON "QuestionBank"("subjectId", "status");

CREATE TYPE "AssessmentQuestionOutcome" AS ENUM ('CORRECT', 'INCORRECT', 'OMITTED');
CREATE TYPE "QuestionDifficultyBand" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D');

ALTER TABLE "Assessment" ADD COLUMN "questionBankId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "generationFilters" JSONB;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "QuestionBank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Assessment_questionBankId_idx" ON "Assessment"("questionBankId");
ALTER TABLE "AssessmentAttemptAnswer" ADD COLUMN "outcome" "AssessmentQuestionOutcome";

CREATE TABLE "StudentQuestionMark" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentQuestionMark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentQuestionMark_studentUserId_questionId_key" ON "StudentQuestionMark"("studentUserId", "questionId");
CREATE INDEX "StudentQuestionMark_studentUserId_createdAt_idx" ON "StudentQuestionMark"("studentUserId", "createdAt");
ALTER TABLE "StudentQuestionMark" ADD CONSTRAINT "StudentQuestionMark_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionMark" ADD CONSTRAINT "StudentQuestionMark_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuestionCommunityStat" (
  "questionId" TEXT NOT NULL,
  "totalResponses" INTEGER NOT NULL DEFAULT 0,
  "correctResponses" INTEGER NOT NULL DEFAULT 0,
  "incorrectResponses" INTEGER NOT NULL DEFAULT 0,
  "incorrectRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "difficultyBand" "QuestionDifficultyBand" NOT NULL DEFAULT 'D',
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionCommunityStat_pkey" PRIMARY KEY ("questionId")
);
CREATE INDEX "QuestionCommunityStat_difficultyBand_idx" ON "QuestionCommunityStat"("difficultyBand");
ALTER TABLE "QuestionCommunityStat" ADD CONSTRAINT "QuestionCommunityStat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
