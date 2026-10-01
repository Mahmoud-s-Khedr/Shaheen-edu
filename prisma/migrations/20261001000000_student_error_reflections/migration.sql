CREATE TYPE "StudentErrorReason" AS ENUM (
  'DID_NOT_KNOW_HOW_TO_SOLVE',
  'DID_NOT_UNDERSTAND_THE_QUESTION',
  'MADE_A_CALCULATION_MISTAKE',
  'MADE_A_CARELESS_MISTAKE'
);

CREATE TABLE "StudentErrorReflection" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "reason" "StudentErrorReason" NOT NULL,
  "practiceAttemptId" TEXT,
  "assessmentAttemptAnswerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StudentErrorReflection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentErrorReflection_one_parent_check" CHECK (
    ("practiceAttemptId" IS NOT NULL)::integer +
    ("assessmentAttemptAnswerId" IS NOT NULL)::integer = 1
  )
);

CREATE UNIQUE INDEX "StudentErrorReflection_practiceAttemptId_key"
  ON "StudentErrorReflection"("practiceAttemptId");
CREATE UNIQUE INDEX "StudentErrorReflection_assessmentAttemptAnswerId_key"
  ON "StudentErrorReflection"("assessmentAttemptAnswerId");
CREATE INDEX "StudentErrorReflection_studentUserId_createdAt_idx"
  ON "StudentErrorReflection"("studentUserId", "createdAt");
CREATE INDEX "StudentErrorReflection_reason_idx"
  ON "StudentErrorReflection"("reason");

ALTER TABLE "StudentErrorReflection"
  ADD CONSTRAINT "StudentErrorReflection_studentUserId_fkey"
  FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentErrorReflection"
  ADD CONSTRAINT "StudentErrorReflection_practiceAttemptId_fkey"
  FOREIGN KEY ("practiceAttemptId") REFERENCES "StudentQuestionAttempt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentErrorReflection"
  ADD CONSTRAINT "StudentErrorReflection_assessmentAttemptAnswerId_fkey"
  FOREIGN KEY ("assessmentAttemptAnswerId") REFERENCES "AssessmentAttemptAnswer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
