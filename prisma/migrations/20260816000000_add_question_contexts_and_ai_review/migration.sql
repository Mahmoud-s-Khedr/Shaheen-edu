CREATE TYPE "QuestionContextType" AS ENUM ('TEXT', 'IMAGE', 'TABLE', 'EQUATION');
CREATE TYPE "QuestionExplanationOrigin" AS ENUM ('AI', 'HUMAN');
CREATE TYPE "QuestionAnswerOrigin" AS ENUM ('EXPLICIT', 'INFERRED');

ALTER TABLE "AssessmentQuestion" ADD COLUMN "structuredExplanation" JSONB;

ALTER TYPE "QuestionImportItemStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TYPE "QuestionImportItemStatus" ADD VALUE IF NOT EXISTS 'EXCLUDED';
ALTER TABLE "QuestionImportItem" ALTER COLUMN "chunkId" DROP NOT NULL;
ALTER TABLE "QuestionImportItem"
  ADD COLUMN "sourceNumber" TEXT,
  ADD COLUMN "globalOrder" INTEGER,
  ADD COLUMN "section" TEXT,
  ADD COLUMN "detectedType" TEXT,
  ADD COLUMN "exclusionReason" TEXT,
  ADD COLUMN "answerOrigin" "QuestionAnswerOrigin";

CREATE TABLE "QuestionContext" (
  "id" TEXT NOT NULL,
  "type" "QuestionContextType" NOT NULL DEFAULT 'TEXT',
  "title" TEXT,
  "body" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL DEFAULT 'ar',
  "sourceLocator" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionContext_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuestionContext_type_createdAt_idx" ON "QuestionContext"("type", "createdAt");

CREATE TABLE "QuestionContextQuestion" (
  "questionId" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "QuestionContextQuestion_pkey" PRIMARY KEY ("questionId", "contextId")
);
CREATE INDEX "QuestionContextQuestion_contextId_idx" ON "QuestionContextQuestion"("contextId");
ALTER TABLE "QuestionContextQuestion" ADD CONSTRAINT "QuestionContextQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionContextQuestion" ADD CONSTRAINT "QuestionContextQuestion_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "QuestionContext"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuestionExplanation" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL DEFAULT 'ar',
  "keywords" TEXT NOT NULL,
  "eliminationStrategy" TEXT NOT NULL,
  "whyCorrect" TEXT NOT NULL,
  "generalRule" TEXT NOT NULL,
  "whatIf" TEXT NOT NULL,
  "commonMistakes" TEXT NOT NULL,
  "origin" "QuestionExplanationOrigin" NOT NULL DEFAULT 'HUMAN',
  "model" TEXT,
  "confidence" DOUBLE PRECISION,
  "answerOrigin" "QuestionAnswerOrigin",
  "warnings" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionExplanation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionExplanation_questionId_key" ON "QuestionExplanation"("questionId");
ALTER TABLE "QuestionExplanation" ADD CONSTRAINT "QuestionExplanation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentContext" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "sourceContextId" TEXT NOT NULL,
  "type" "QuestionContextType" NOT NULL,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "languageCode" TEXT NOT NULL,
  "sourceLocator" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentContext_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentContext_assessmentId_sourceContextId_key" ON "AssessmentContext"("assessmentId", "sourceContextId");
CREATE INDEX "AssessmentContext_assessmentId_idx" ON "AssessmentContext"("assessmentId");
ALTER TABLE "AssessmentContext" ADD CONSTRAINT "AssessmentContext_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentQuestionContext" (
  "assessmentQuestionId" TEXT NOT NULL,
  "assessmentContextId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "AssessmentQuestionContext_pkey" PRIMARY KEY ("assessmentQuestionId", "assessmentContextId")
);
CREATE INDEX "AssessmentQuestionContext_assessmentContextId_idx" ON "AssessmentQuestionContext"("assessmentContextId");
ALTER TABLE "AssessmentQuestionContext" ADD CONSTRAINT "AssessmentQuestionContext_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssessmentQuestionContext" ADD CONSTRAINT "AssessmentQuestionContext_assessmentContextId_fkey" FOREIGN KEY ("assessmentContextId") REFERENCES "AssessmentContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
