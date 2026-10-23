-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "FormQuestionType" AS ENUM ('TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "FormRespondentType" AS ENUM ('STUDENT', 'PARENT');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "confirmationMessage" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormQuestion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "FormQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "FormQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentType" "FormRespondentType" NOT NULL,
    "studentUserId" TEXT,
    "parentPhoneNormalized" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAnswerSelection" (
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "FormAnswerSelection_pkey" PRIMARY KEY ("answerId","optionId")
);

-- CreateIndex
CREATE INDEX "Form_status_createdAt_id_idx" ON "Form"("status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormQuestion_formId_sortOrder_key" ON "FormQuestion"("formId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormQuestionOption_questionId_sortOrder_key" ON "FormQuestionOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_respondentType_submittedAt_id_idx" ON "FormSubmission"("formId", "respondentType", "submittedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_formId_studentUserId_key" ON "FormSubmission"("formId", "studentUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_formId_parentPhoneNormalized_key" ON "FormSubmission"("formId", "parentPhoneNormalized");

-- CreateIndex
CREATE INDEX "FormAnswer_questionId_idx" ON "FormAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAnswer_submissionId_questionId_key" ON "FormAnswer"("submissionId", "questionId");

-- CreateIndex
CREATE INDEX "FormAnswerSelection_optionId_idx" ON "FormAnswerSelection"("optionId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestion" ADD CONSTRAINT "FormQuestion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormQuestionOption" ADD CONSTRAINT "FormQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FormQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "FormQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswerSelection" ADD CONSTRAINT "FormAnswerSelection_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "FormAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswerSelection" ADD CONSTRAINT "FormAnswerSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "FormQuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce one active form across every API instance, including concurrent activation.
CREATE UNIQUE INDEX "Form_single_active" ON "Form" ((1)) WHERE "status" = 'ACTIVE';

ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_respondent_identity"
CHECK (
  ("respondentType" = 'STUDENT' AND "studentUserId" IS NOT NULL AND "parentPhoneNormalized" IS NULL)
  OR ("respondentType" = 'PARENT' AND "parentPhoneNormalized" IS NOT NULL AND "studentUserId" IS NULL)
);
