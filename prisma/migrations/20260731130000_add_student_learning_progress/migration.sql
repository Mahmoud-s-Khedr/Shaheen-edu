CREATE TABLE "StudentContentProgress" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentContentProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentQuestionAttempt" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentQuestionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentQuestionAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    CONSTRAINT "StudentQuestionAttemptAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentContentProgress_studentUserId_contentItemId_key" ON "StudentContentProgress"("studentUserId", "contentItemId");
CREATE INDEX "StudentContentProgress_studentUserId_completedAt_idx" ON "StudentContentProgress"("studentUserId", "completedAt");
CREATE INDEX "StudentContentProgress_contentItemId_idx" ON "StudentContentProgress"("contentItemId");
CREATE UNIQUE INDEX "StudentQuestionAttempt_studentUserId_questionId_attemptNumber_key" ON "StudentQuestionAttempt"("studentUserId", "questionId", "attemptNumber");
CREATE INDEX "StudentQuestionAttempt_studentUserId_submittedAt_idx" ON "StudentQuestionAttempt"("studentUserId", "submittedAt");
CREATE INDEX "StudentQuestionAttempt_questionId_submittedAt_idx" ON "StudentQuestionAttempt"("questionId", "submittedAt");
CREATE UNIQUE INDEX "StudentQuestionAttemptAnswer_attemptId_optionId_key" ON "StudentQuestionAttemptAnswer"("attemptId", "optionId");
CREATE INDEX "StudentQuestionAttemptAnswer_optionId_idx" ON "StudentQuestionAttemptAnswer"("optionId");

ALTER TABLE "StudentContentProgress" ADD CONSTRAINT "StudentContentProgress_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentContentProgress" ADD CONSTRAINT "StudentContentProgress_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionAttempt" ADD CONSTRAINT "StudentQuestionAttempt_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionAttempt" ADD CONSTRAINT "StudentQuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionAttemptAnswer" ADD CONSTRAINT "StudentQuestionAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentQuestionAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionAttemptAnswer" ADD CONSTRAINT "StudentQuestionAttemptAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
