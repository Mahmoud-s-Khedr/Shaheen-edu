CREATE TYPE "QuestionExplanationFormat" AS ENUM ('SIX_SECTION', 'WRITTEN_FOUR_SECTION');
ALTER TABLE "QuestionExplanation"
  ADD COLUMN "structuredExplanationFormat" "QuestionExplanationFormat" NOT NULL DEFAULT 'SIX_SECTION',
  ADD COLUMN "answerElements" TEXT,
  ADD COLUMN "scientificExplanation" TEXT,
  ALTER COLUMN "keywords" DROP NOT NULL,
  ALTER COLUMN "eliminationStrategy" DROP NOT NULL,
  ALTER COLUMN "whyCorrect" DROP NOT NULL,
  ALTER COLUMN "generalRule" DROP NOT NULL;
ALTER TABLE "QuestionAiExplanationRun" ADD COLUMN "structuredExplanationFormat" "QuestionExplanationFormat" NOT NULL DEFAULT 'SIX_SECTION';
ALTER TABLE "AssessmentQuestion" ADD COLUMN "structuredExplanationFormat" "QuestionExplanationFormat" NOT NULL DEFAULT 'SIX_SECTION';
