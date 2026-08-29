ALTER TABLE "AssessmentAttemptAnswer"
  ADD COLUMN "responseVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AssessmentAnswerAiGradingRun"
  ADD COLUMN "responseVersion" INTEGER NOT NULL DEFAULT 0;
