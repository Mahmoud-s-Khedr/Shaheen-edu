ALTER TYPE "QuestionImportPageStatus" ADD VALUE IF NOT EXISTS 'EXCLUDED';
CREATE TYPE "QuestionImportPageKind" AS ENUM ('COVER_OR_INDEX', 'QUESTION', 'ANSWER_FORM');

ALTER TABLE "QuestionImportPage"
  ADD COLUMN "kind" "QuestionImportPageKind" NOT NULL DEFAULT 'QUESTION',
  ADD COLUMN "initialAiText" TEXT,
  ADD COLUMN "initialCanonicalText" TEXT,
  ADD COLUMN "initialProviderResponse" JSONB,
  ADD COLUMN "initialUsage" JSONB,
  ADD COLUMN "verificationProviderResponse" JSONB,
  ADD COLUMN "verificationUsage" JSONB,
  ADD COLUMN "verifiedAt" TIMESTAMP(3);
