ALTER TABLE "QuestionImportBatch"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "childSequence" INTEGER,
  ADD COLUMN "pageScope" JSONB;

CREATE INDEX "QuestionImportBatch_parentId_childSequence_idx"
  ON "QuestionImportBatch"("parentId", "childSequence");

ALTER TABLE "QuestionImportBatch"
  ADD CONSTRAINT "QuestionImportBatch_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "QuestionImportBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
