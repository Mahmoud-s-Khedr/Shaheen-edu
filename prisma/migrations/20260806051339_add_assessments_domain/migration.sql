-- CreateEnum
CREATE TYPE "AssessmentOwnerType" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssessmentGenerationType" AS ENUM ('STANDARD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AssessmentMode" AS ENUM ('TUTOR', 'EXAM');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssessmentAttemptStatus" AS ENUM ('SUSPENDED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "ownerType" "AssessmentOwnerType" NOT NULL,
    "studentUserId" TEXT,
    "createdByAdminId" TEXT,
    "title" TEXT NOT NULL,
    "generationType" "AssessmentGenerationType" NOT NULL,
    "mode" "AssessmentMode" NOT NULL DEFAULT 'EXAM',
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "durationSeconds" INTEGER,
    "questionCount" INTEGER NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentScope" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "courseId" TEXT,
    "chapterId" TEXT,
    "lessonId" TEXT,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "body" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestionOption" (
    "id" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "AssessmentQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "status" "AssessmentAttemptStatus" NOT NULL DEFAULT 'SUSPENDED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "totalQuestions" INTEGER NOT NULL,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttemptAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "assessmentQuestionId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "isCorrect" BOOLEAN,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentAttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_ownerType_studentUserId_status_createdAt_id_idx" ON "Assessment"("ownerType", "studentUserId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_ownerType_createdByAdminId_status_createdAt_id_idx" ON "Assessment"("ownerType", "createdByAdminId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Assessment_status_createdAt_id_idx" ON "Assessment"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AssessmentScope_assessmentId_idx" ON "AssessmentScope"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentScope_courseId_idx" ON "AssessmentScope"("courseId");

-- CreateIndex
CREATE INDEX "AssessmentScope_chapterId_idx" ON "AssessmentScope"("chapterId");

-- CreateIndex
CREATE INDEX "AssessmentScope_lessonId_idx" ON "AssessmentScope"("lessonId");

-- CreateIndex
CREATE INDEX "AssessmentScope_sectionId_idx" ON "AssessmentScope"("sectionId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_sortOrder_key" ON "AssessmentQuestion"("assessmentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestionOption_assessmentQuestionId_sortOrder_key" ON "AssessmentQuestionOption"("assessmentQuestionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentUserId_status_lastActivityAt_idx" ON "AssessmentAttempt"("studentUserId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_idx" ON "AssessmentAttempt"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_studentUserId_key" ON "AssessmentAttempt"("assessmentId", "studentUserId");

-- CreateIndex
CREATE INDEX "AssessmentAttemptAnswer_attemptId_idx" ON "AssessmentAttemptAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttemptAnswer_attemptId_assessmentQuestionId_key" ON "AssessmentAttemptAnswer"("attemptId", "assessmentQuestionId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentScope" ADD CONSTRAINT "AssessmentScope_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestionOption" ADD CONSTRAINT "AssessmentQuestionOption_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttemptAnswer" ADD CONSTRAINT "AssessmentAttemptAnswer_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
