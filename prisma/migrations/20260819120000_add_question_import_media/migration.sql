CREATE TYPE "QuestionImportMediaStatus" AS ENUM ('REVIEW_REQUIRED', 'ELIGIBLE', 'REJECTED', 'FAILED');
CREATE TYPE "QuestionImportMediaType" AS ENUM ('DIAGRAM', 'CHART', 'MAP', 'TABLE', 'EQUATION', 'PHOTO', 'OPTION_IMAGE', 'OTHER_INSTRUCTIONAL');
CREATE TYPE "QuestionImportMediaDetectionSource" AS ENUM ('AI', 'MANUAL');

CREATE TABLE "QuestionImportMedia" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "normalizedBounds" JSONB NOT NULL,
    "renderedBounds" JSONB NOT NULL,
    "pageDimensions" JSONB NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "renderDpi" INTEGER NOT NULL,
    "type" "QuestionImportMediaType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "warnings" JSONB,
    "validationFlags" JSONB,
    "checksum" TEXT,
    "assetId" TEXT,
    "status" "QuestionImportMediaStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "materializedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionImportMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionImportMediaDetection" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "source" "QuestionImportMediaDetectionSource" NOT NULL,
    "normalizedBounds" JSONB NOT NULL,
    "type" "QuestionImportMediaType" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "description" TEXT,
    "warnings" JSONB,
    "rawEvidence" JSONB,
    "validationFlags" JSONB,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuestionImportMediaDetection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionImportMedia_batchId_mediaKey_key" ON "QuestionImportMedia"("batchId", "mediaKey");
CREATE UNIQUE INDEX "QuestionImportMedia_assetId_key" ON "QuestionImportMedia"("assetId");
CREATE INDEX "QuestionImportMedia_batchId_pageNumber_status_idx" ON "QuestionImportMedia"("batchId", "pageNumber", "status");
CREATE INDEX "QuestionImportMedia_batchId_checksum_idx" ON "QuestionImportMedia"("batchId", "checksum");
CREATE INDEX "QuestionImportMediaDetection_mediaId_createdAt_idx" ON "QuestionImportMediaDetection"("mediaId", "createdAt");

ALTER TABLE "QuestionImportMedia" ADD CONSTRAINT "QuestionImportMedia_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "QuestionImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionImportMedia" ADD CONSTRAINT "QuestionImportMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionImportMediaDetection" ADD CONSTRAINT "QuestionImportMediaDetection_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "QuestionImportMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
