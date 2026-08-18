CREATE TYPE "QuestionContentBlockType" AS ENUM ('TEXT', 'IMAGE', 'ASSET', 'TABLE', 'EQUATION');

CREATE TABLE "QuestionContentBlock" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "type" "QuestionContentBlockType" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "text" TEXT,
  "assetId" TEXT,
  "tableData" JSONB,
  "latex" TEXT,
  "mathml" TEXT,
  "caption" TEXT,
  "altText" TEXT,
  "languageCode" TEXT,
  CONSTRAINT "QuestionContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionContentBlock_questionId_sortOrder_key" ON "QuestionContentBlock"("questionId", "sortOrder");
CREATE INDEX "QuestionContentBlock_assetId_idx" ON "QuestionContentBlock"("assetId");
ALTER TABLE "QuestionContentBlock" ADD CONSTRAINT "QuestionContentBlock_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionContentBlock" ADD CONSTRAINT "QuestionContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuestionOptionContentBlock" (
  "id" TEXT NOT NULL, "questionOptionId" TEXT NOT NULL, "type" "QuestionContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
  "text" TEXT, "assetId" TEXT, "tableData" JSONB, "latex" TEXT, "mathml" TEXT, "caption" TEXT, "altText" TEXT, "languageCode" TEXT,
  CONSTRAINT "QuestionOptionContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionOptionContentBlock_questionOptionId_sortOrder_key" ON "QuestionOptionContentBlock"("questionOptionId", "sortOrder");
CREATE INDEX "QuestionOptionContentBlock_assetId_idx" ON "QuestionOptionContentBlock"("assetId");
ALTER TABLE "QuestionOptionContentBlock" ADD CONSTRAINT "QuestionOptionContentBlock_questionOptionId_fkey" FOREIGN KEY ("questionOptionId") REFERENCES "QuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionOptionContentBlock" ADD CONSTRAINT "QuestionOptionContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuestionContextContentBlock" (
  "id" TEXT NOT NULL, "questionContextId" TEXT NOT NULL, "type" "QuestionContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
  "text" TEXT, "assetId" TEXT, "tableData" JSONB, "latex" TEXT, "mathml" TEXT, "caption" TEXT, "altText" TEXT, "languageCode" TEXT,
  CONSTRAINT "QuestionContextContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuestionContextContentBlock_questionContextId_sortOrder_key" ON "QuestionContextContentBlock"("questionContextId", "sortOrder");
CREATE INDEX "QuestionContextContentBlock_assetId_idx" ON "QuestionContextContentBlock"("assetId");
ALTER TABLE "QuestionContextContentBlock" ADD CONSTRAINT "QuestionContextContentBlock_questionContextId_fkey" FOREIGN KEY ("questionContextId") REFERENCES "QuestionContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionContextContentBlock" ADD CONSTRAINT "QuestionContextContentBlock_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssessmentQuestionContentBlock" (
  "id" TEXT NOT NULL, "assessmentQuestionId" TEXT NOT NULL, "type" "QuestionContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
  "text" TEXT, "assetId" TEXT, "assetKind" "AssetKind", "assetName" TEXT, "tableData" JSONB, "latex" TEXT, "mathml" TEXT, "caption" TEXT, "altText" TEXT, "languageCode" TEXT,
  CONSTRAINT "AssessmentQuestionContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentQuestionContentBlock_assessmentQuestionId_sortOrder_key" ON "AssessmentQuestionContentBlock"("assessmentQuestionId", "sortOrder");
CREATE INDEX "AssessmentQuestionContentBlock_assetId_idx" ON "AssessmentQuestionContentBlock"("assetId");
ALTER TABLE "AssessmentQuestionContentBlock" ADD CONSTRAINT "AssessmentQuestionContentBlock_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentQuestionOptionContentBlock" (
  "id" TEXT NOT NULL, "assessmentQuestionOptionId" TEXT NOT NULL, "type" "QuestionContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
  "text" TEXT, "assetId" TEXT, "assetKind" "AssetKind", "assetName" TEXT, "tableData" JSONB, "latex" TEXT, "mathml" TEXT, "caption" TEXT, "altText" TEXT, "languageCode" TEXT,
  CONSTRAINT "AssessmentQuestionOptionContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentQuestionOptionContentBlock_assessmentQuestionOptionId_sortOrder_key" ON "AssessmentQuestionOptionContentBlock"("assessmentQuestionOptionId", "sortOrder");
CREATE INDEX "AssessmentQuestionOptionContentBlock_assetId_idx" ON "AssessmentQuestionOptionContentBlock"("assetId");
ALTER TABLE "AssessmentQuestionOptionContentBlock" ADD CONSTRAINT "AssessmentQuestionOptionContentBlock_assessmentQuestionOptionId_fkey" FOREIGN KEY ("assessmentQuestionOptionId") REFERENCES "AssessmentQuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentContextContentBlock" (
  "id" TEXT NOT NULL, "assessmentContextId" TEXT NOT NULL, "type" "QuestionContentBlockType" NOT NULL, "sortOrder" INTEGER NOT NULL,
  "text" TEXT, "assetId" TEXT, "assetKind" "AssetKind", "assetName" TEXT, "tableData" JSONB, "latex" TEXT, "mathml" TEXT, "caption" TEXT, "altText" TEXT, "languageCode" TEXT,
  CONSTRAINT "AssessmentContextContentBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentContextContentBlock_assessmentContextId_sortOrder_key" ON "AssessmentContextContentBlock"("assessmentContextId", "sortOrder");
CREATE INDEX "AssessmentContextContentBlock_assetId_idx" ON "AssessmentContextContentBlock"("assetId");
ALTER TABLE "AssessmentContextContentBlock" ADD CONSTRAINT "AssessmentContextContentBlock_assessmentContextId_fkey" FOREIGN KEY ("assessmentContextId") REFERENCES "AssessmentContext"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the legacy delivery contract while making blocks canonical. Existing
-- question bodies become the first text fragment; current attachments follow.
INSERT INTO "QuestionContentBlock" ("id", "questionId", "type", "sortOrder", "text")
SELECT concat('qcb_', md5(q.id)), q.id, 'TEXT'::"QuestionContentBlockType", 1, q.body
FROM "Question" q;
INSERT INTO "QuestionContentBlock" ("id", "questionId", "type", "sortOrder", "assetId")
SELECT concat('qcb_', md5(qa.id)), qa."questionId",
       CASE WHEN a.kind = 'IMAGE'::"AssetKind" THEN 'IMAGE'::"QuestionContentBlockType" ELSE 'ASSET'::"QuestionContentBlockType" END,
       qa."sortOrder" + 1, qa."assetId"
FROM "QuestionAsset" qa JOIN "Asset" a ON a.id = qa."assetId";
INSERT INTO "QuestionOptionContentBlock" ("id", "questionOptionId", "type", "sortOrder", "text")
SELECT concat('qocb_', md5(o.id)), o.id, 'TEXT'::"QuestionContentBlockType", 1, o.body FROM "QuestionOption" o;
INSERT INTO "QuestionContextContentBlock" ("id", "questionContextId", "type", "sortOrder", "text", "languageCode")
SELECT concat('qccb_', md5(c.id)), c.id, 'TEXT'::"QuestionContentBlockType", 1, c.body, c."languageCode" FROM "QuestionContext" c;
