CREATE TYPE "ReferralReviewRuleKind" AS ENUM ('STUDENT_PROGRAM_APPROVED_SALES', 'STUDENT_CODE_APPROVED_SALES');
CREATE TYPE "ReferralReviewAction" AS ENUM ('BLOCK_CHECKOUT', 'QUEUE_REVIEW');
CREATE TYPE "ReferralReviewFlagSource" AS ENUM ('AUTOMATED', 'MANUAL');
CREATE TYPE "ReferralReviewStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'ACCEPTED');
CREATE TYPE "ReferralReviewDisposition" AS ENUM ('CLEARED', 'CONFIRMED_FRAUD', 'NO_ACTION', 'ESCALATED');

CREATE TABLE "ReferralReviewRule" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "ReferralReviewRuleKind" NOT NULL,
  "action" "ReferralReviewAction" NOT NULL,
  "threshold" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralReviewRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralReviewRule_programId_isActive_idx" ON "ReferralReviewRule"("programId", "isActive");
ALTER TABLE "ReferralReviewRule" ADD CONSTRAINT "ReferralReviewRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewRule" ADD CONSTRAINT "ReferralReviewRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewRule" ADD CONSTRAINT "ReferralReviewRule_positive_threshold" CHECK ("threshold" > 0);

CREATE TABLE "ReferralReviewFlag" (
  "id" TEXT NOT NULL,
  "attributionId" TEXT NOT NULL,
  "ruleId" TEXT,
  "source" "ReferralReviewFlagSource" NOT NULL,
  "type" TEXT NOT NULL,
  "action" "ReferralReviewAction" NOT NULL,
  "observedValue" INTEGER,
  "threshold" INTEGER,
  "metadata" JSONB,
  "status" "ReferralReviewStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "disposition" "ReferralReviewDisposition",
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralReviewFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralReviewFlag_status_createdAt_idx" ON "ReferralReviewFlag"("status", "createdAt");
CREATE INDEX "ReferralReviewFlag_attributionId_idx" ON "ReferralReviewFlag"("attributionId");
CREATE INDEX "ReferralReviewFlag_assignedToId_status_idx" ON "ReferralReviewFlag"("assignedToId", "status");
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "OrderReferralAttribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReferralReviewRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewFlag" ADD CONSTRAINT "ReferralReviewFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReferralReviewNote" (
  "id" TEXT NOT NULL,
  "flagId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralReviewNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralReviewNote_flagId_createdAt_idx" ON "ReferralReviewNote"("flagId", "createdAt");
ALTER TABLE "ReferralReviewNote" ADD CONSTRAINT "ReferralReviewNote_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "ReferralReviewFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralReviewNote" ADD CONSTRAINT "ReferralReviewNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
