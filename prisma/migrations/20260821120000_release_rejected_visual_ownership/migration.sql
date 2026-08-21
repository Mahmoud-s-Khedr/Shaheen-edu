-- Rejected assignments are audit evidence, not active exclusive ownership.
-- Clearing their key lets a reviewer reassign the crop to another candidate.
UPDATE "QuestionImportMediaAssignment"
SET "exclusiveOwnershipKey" = NULL
WHERE "status" = 'REJECTED'
  AND "exclusiveOwnershipKey" IS NOT NULL;
