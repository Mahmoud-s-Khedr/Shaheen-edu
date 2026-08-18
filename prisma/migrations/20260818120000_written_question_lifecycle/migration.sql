ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SHORT_ANSWER';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'FILL_IN_THE_BLANK';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'LONG_ANSWER';

CREATE TYPE "QuestionAnswerProvenance" AS ENUM ('OFFICIAL', 'SOURCE_MARKED', 'AI_INFERRED', 'HUMAN_REVIEWED');
ALTER TYPE "AssessmentQuestionOutcome" ADD VALUE IF NOT EXISTS 'PENDING_GRADING';
ALTER TYPE "AssessmentQuestionOutcome" ADD VALUE IF NOT EXISTS 'PARTIALLY_CORRECT';

ALTER TABLE "Question"
  ADD COLUMN "maxPoints" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "acceptedAnswers" JSONB,
  ADD COLUMN "gradingRubric" TEXT,
  ADD COLUMN "answerOrigin" "QuestionAnswerProvenance",
  ADD COLUMN "answerReviewedAt" TIMESTAMP(3),
  ADD COLUMN "answerReviewedById" TEXT;
ALTER TABLE "Question" ADD CONSTRAINT "Question_answerReviewedById_fkey"
  FOREIGN KEY ("answerReviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentQuestion"
  ADD COLUMN "maxPoints" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "acceptedAnswers" JSONB,
  ADD COLUMN "gradingRubric" TEXT,
  ADD COLUMN "answerOrigin" "QuestionAnswerProvenance";
ALTER TABLE "AssessmentAttempt" ADD COLUMN "totalPoints" INTEGER NOT NULL DEFAULT 0;
UPDATE "AssessmentAttempt" SET "totalPoints" = "totalQuestions";

ALTER TABLE "AssessmentAttemptAnswer"
  ADD COLUMN "responseText" TEXT,
  ADD COLUMN "awardedPoints" INTEGER,
  ADD COLUMN "gradedAt" TIMESTAMP(3),
  ADD COLUMN "gradedById" TEXT,
  ADD COLUMN "graderFeedback" TEXT;
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_gradedById_fkey"
  FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentAnswerChange"
  ADD COLUMN "fromResponseText" TEXT,
  ADD COLUMN "toResponseText" TEXT;
