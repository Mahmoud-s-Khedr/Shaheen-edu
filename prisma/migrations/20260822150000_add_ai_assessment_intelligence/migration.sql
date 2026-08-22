ALTER TYPE "AssessmentGenerationType" ADD VALUE IF NOT EXISTS 'AI_PROMPT';
ALTER TYPE "AssessmentQuestionOutcome" ADD VALUE IF NOT EXISTS 'PENDING_AI_GRADING';

CREATE TYPE "AnswerInputMethod" AS ENUM ('TEXT', 'VOICE_TRANSCRIPT');
CREATE TYPE "AiRunStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "QuestionReportType" AS ENUM ('WRONG_ANSWER', 'UNCLEAR_WORDING', 'TYPO_LANGUAGE', 'MISSING_OR_BROKEN_MEDIA', 'DUPLICATE', 'OTHER');
CREATE TYPE "QuestionReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

ALTER TABLE "AssessmentAttemptAnswer"
  ADD COLUMN "inputMethod" "AnswerInputMethod" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "responseLanguageCode" TEXT,
  ADD COLUMN "transcriptionProvider" TEXT,
  ADD COLUMN "transcriptionConfidence" DOUBLE PRECISION;

CREATE TABLE "AssessmentAnswerAiGradingRun" (
  "id" TEXT NOT NULL,
  "attemptAnswerId" TEXT NOT NULL,
  "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
  "questionSnapshot" JSONB NOT NULL,
  "responseSnapshot" TEXT NOT NULL,
  "responseLanguageCode" TEXT NOT NULL,
  "proposedPoints" INTEGER,
  "proposedOutcome" "AssessmentQuestionOutcome",
  "feedback" TEXT,
  "highlights" JSONB,
  "model" TEXT,
  "promptVersion" TEXT NOT NULL,
  "rawResponse" JSONB,
  "usage" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AssessmentAnswerAiGradingRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiQuizGenerationRun" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "assessmentId" TEXT,
  "status" "AiRunStatus" NOT NULL DEFAULT 'PENDING',
  "prompt" TEXT NOT NULL,
  "requestedFilters" JSONB NOT NULL,
  "normalizedPlan" JSONB,
  "rationale" TEXT,
  "eligibleQuestionIds" JSONB,
  "selectedQuestionIds" JSONB,
  "model" TEXT,
  "promptVersion" TEXT NOT NULL,
  "rawResponse" JSONB,
  "usage" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AiQuizGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionReport" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "type" "QuestionReportType" NOT NULL,
  "note" TEXT,
  "questionSnapshot" JSONB NOT NULL,
  "status" "QuestionReportStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionReportAction" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "fromStatus" "QuestionReportStatus",
  "toStatus" "QuestionReportStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionReportAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiQuizGenerationRun_assessmentId_key" ON "AiQuizGenerationRun"("assessmentId");
CREATE INDEX "AssessmentAnswerAiGradingRun_attemptAnswerId_createdAt_idx" ON "AssessmentAnswerAiGradingRun"("attemptAnswerId", "createdAt");
CREATE INDEX "AssessmentAnswerAiGradingRun_status_createdAt_idx" ON "AssessmentAnswerAiGradingRun"("status", "createdAt");
CREATE INDEX "AiQuizGenerationRun_studentUserId_createdAt_idx" ON "AiQuizGenerationRun"("studentUserId", "createdAt");
CREATE INDEX "AiQuizGenerationRun_status_createdAt_idx" ON "AiQuizGenerationRun"("status", "createdAt");
CREATE INDEX "QuestionReport_studentUserId_questionId_type_status_idx" ON "QuestionReport"("studentUserId", "questionId", "type", "status");
CREATE INDEX "QuestionReport_status_createdAt_idx" ON "QuestionReport"("status", "createdAt");
CREATE INDEX "QuestionReport_questionId_status_idx" ON "QuestionReport"("questionId", "status");
CREATE INDEX "QuestionReportAction_reportId_createdAt_idx" ON "QuestionReportAction"("reportId", "createdAt");

ALTER TABLE "AssessmentAnswerAiGradingRun" ADD CONSTRAINT "AssessmentAnswerAiGradingRun_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AssessmentAttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiQuizGenerationRun" ADD CONSTRAINT "AiQuizGenerationRun_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiQuizGenerationRun" ADD CONSTRAINT "AiQuizGenerationRun_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionReportAction" ADD CONSTRAINT "QuestionReportAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QuestionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionReportAction" ADD CONSTRAINT "QuestionReportAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
