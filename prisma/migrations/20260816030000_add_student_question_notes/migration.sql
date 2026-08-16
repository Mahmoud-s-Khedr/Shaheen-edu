CREATE TABLE "StudentQuestionNote" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentQuestionNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentQuestionNote_studentUserId_questionId_key"
  ON "StudentQuestionNote"("studentUserId", "questionId");
CREATE INDEX "StudentQuestionNote_studentUserId_updatedAt_idx"
  ON "StudentQuestionNote"("studentUserId", "updatedAt");

ALTER TABLE "StudentQuestionNote"
  ADD CONSTRAINT "StudentQuestionNote_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentQuestionNote"
  ADD CONSTRAINT "StudentQuestionNote_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
