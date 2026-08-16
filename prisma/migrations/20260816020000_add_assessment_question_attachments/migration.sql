CREATE TABLE "AssessmentQuestionAsset" (
  "id" TEXT NOT NULL,
  "assessmentQuestionId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "assetKind" "AssetKind" NOT NULL,
  "assetName" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,

  CONSTRAINT "AssessmentQuestionAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentQuestionAsset_assessmentQuestionId_assetId_key"
  ON "AssessmentQuestionAsset"("assessmentQuestionId", "assetId");
CREATE UNIQUE INDEX "AssessmentQuestionAsset_assessmentQuestionId_sortOrder_key"
  ON "AssessmentQuestionAsset"("assessmentQuestionId", "sortOrder");
CREATE INDEX "AssessmentQuestionAsset_assetId_idx"
  ON "AssessmentQuestionAsset"("assetId");

ALTER TABLE "AssessmentQuestionAsset"
  ADD CONSTRAINT "AssessmentQuestionAsset_assessmentQuestionId_fkey"
  FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
