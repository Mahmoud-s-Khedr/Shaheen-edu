CREATE TYPE "QuestionImportVisualRequirementKind" AS ENUM ('NONE', 'QUESTION_FIGURE', 'COMPOSITE_OPTION_FIGURE', 'OPTION_IMAGE_SET', 'SHARED_STIMULUS');
CREATE TYPE "QuestionImportVisualResolutionState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'RESOLVED', 'UNRESOLVED', 'AMBIGUOUS', 'INCOMPLETE_CROP');
CREATE TYPE "QuestionImportMediaCropCompleteness" AS ENUM ('UNKNOWN', 'COMPLETE', 'POSSIBLY_CLIPPED', 'INCOMPLETE');

ALTER TYPE "QuestionImportMediaAssignmentStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';

ALTER TABLE "QuestionImportMedia"
  ADD COLUMN "cropCompleteness" "QuestionImportMediaCropCompleteness" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "cropVerification" JSONB;
ALTER TABLE "QuestionImportMediaAssignment"
  ADD COLUMN "scoreComponents" JSONB,
  ADD COLUMN "evidenceVersion" TEXT;
ALTER TABLE "QuestionImportSourceBlock" ADD COLUMN "envelope" JSONB;
ALTER TABLE "QuestionImportPage" ADD COLUMN "layoutEnvelopes" JSONB;
ALTER TABLE "QuestionImportItem"
  ADD COLUMN "visualState" "QuestionImportVisualResolutionState" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "visualEvidenceVersion" TEXT,
  ADD COLUMN "answerContentValid" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "QuestionImportVisualRequirement" (
  "id" TEXT NOT NULL,
  "importItemId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "kind" "QuestionImportVisualRequirementKind" NOT NULL,
  "sourcePage" INTEGER,
  "sourceEnvelope" JSONB,
  "owner" "QuestionImportMediaAssignmentOwner",
  "ownerReference" TEXT,
  "optionIndexes" JSONB,
  "expectedCardinality" INTEGER NOT NULL DEFAULT 0,
  "interpretationRequired" BOOLEAN NOT NULL DEFAULT true,
  "resolutionState" "QuestionImportVisualResolutionState" NOT NULL DEFAULT 'PENDING',
  "unresolvedReason" TEXT,
  "candidateRankings" JSONB,
  "evidenceVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionImportVisualRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionImportVisualRequirement_importItemId_requirementKey_key" ON "QuestionImportVisualRequirement"("importItemId", "requirementKey");
CREATE INDEX "QuestionImportVisualRequirement_importItemId_resolutionState_idx" ON "QuestionImportVisualRequirement"("importItemId", "resolutionState");
ALTER TABLE "QuestionImportVisualRequirement" ADD CONSTRAINT "QuestionImportVisualRequirement_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "QuestionImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- V4 evidence remains historical proposal-only evidence. Existing answers that
-- depended on it are never treated as V5-valid until reprocessed.
UPDATE "QuestionImportMediaAssignment" SET "status" = 'PROPOSED'
WHERE "status" = 'APPROVED' AND EXISTS (
  SELECT 1 FROM "QuestionImportItem" i JOIN "QuestionImportBatch" b ON b.id = i."batchId"
  WHERE i.id = "QuestionImportMediaAssignment"."importItemId" AND b."schemaVersion" = 'question-import-v4'
);
UPDATE "QuestionImportItem" SET "answerContentValid" = false, "visualState" = 'UNRESOLVED', "visualEvidenceVersion" = NULL
WHERE EXISTS (
  SELECT 1 FROM "QuestionImportMediaAssignment" a
  JOIN "QuestionImportBatch" b ON b.id = "QuestionImportItem"."batchId"
  WHERE a."importItemId" = "QuestionImportItem".id AND b."schemaVersion" = 'question-import-v4'
);
