CREATE TYPE "QuestionImportMediaAssignmentOwner" AS ENUM ('QUESTION', 'OPTION', 'CONTEXT');
CREATE TYPE "QuestionImportMediaAssignmentStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

CREATE TABLE "QuestionImportContext" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "contextKey" TEXT NOT NULL,
  "contextId" TEXT NOT NULL,
  "firstBlock" TEXT NOT NULL,
  "lastBlock" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionImportContext_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionImportContext_batchId_contextKey_key" ON "QuestionImportContext"("batchId", "contextKey");
CREATE UNIQUE INDEX "QuestionImportContext_batchId_contextId_key" ON "QuestionImportContext"("batchId", "contextId");
CREATE INDEX "QuestionImportContext_contextId_idx" ON "QuestionImportContext"("contextId");
ALTER TABLE "QuestionImportContext" ADD CONSTRAINT "QuestionImportContext_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportContext" ADD CONSTRAINT "QuestionImportContext_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "QuestionContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuestionImportMediaAssignment" (
  "id" TEXT NOT NULL,
  "importItemId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "assignmentKey" TEXT NOT NULL,
  "owner" "QuestionImportMediaAssignmentOwner" NOT NULL,
  "ownerReference" TEXT NOT NULL,
  "placementAnchor" TEXT,
  "confidence" DOUBLE PRECISION,
  "reason" TEXT,
  "status" "QuestionImportMediaAssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "finalContentBlockId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionImportMediaAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionImportMediaAssignment_importItemId_assignmentKey_key" ON "QuestionImportMediaAssignment"("importItemId", "assignmentKey");
CREATE INDEX "QuestionImportMediaAssignment_mediaId_status_idx" ON "QuestionImportMediaAssignment"("mediaId", "status");
CREATE INDEX "QuestionImportMediaAssignment_importItemId_status_idx" ON "QuestionImportMediaAssignment"("importItemId", "status");
ALTER TABLE "QuestionImportMediaAssignment" ADD CONSTRAINT "QuestionImportMediaAssignment_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "QuestionImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportMediaAssignment" ADD CONSTRAINT "QuestionImportMediaAssignment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "QuestionImportMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
