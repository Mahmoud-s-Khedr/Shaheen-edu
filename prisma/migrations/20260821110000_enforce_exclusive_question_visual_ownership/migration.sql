ALTER TABLE "QuestionImportMediaAssignment"
  ADD COLUMN "exclusiveOwnershipKey" TEXT;

CREATE UNIQUE INDEX "QuestionImportMediaAssignment_exclusiveOwnershipKey_key"
  ON "QuestionImportMediaAssignment"("exclusiveOwnershipKey");
