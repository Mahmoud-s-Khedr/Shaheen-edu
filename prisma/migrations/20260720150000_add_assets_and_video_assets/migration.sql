CREATE TYPE "AssetProvider" AS ENUM ('BUNNY_STORAGE', 'BUNNY_STREAM');
CREATE TYPE "AssetKind" AS ENUM ('COVER_IMAGE', 'IMAGE', 'PDF', 'DOCUMENT', 'DOWNLOADABLE_FILE', 'VIDEO');
CREATE TYPE "AssetStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADING', 'READY', 'FAILED', 'ARCHIVED');
CREATE TYPE "AssetReferenceType" AS ENUM ('CONTENT_ATTACHMENT');
CREATE TYPE "VideoProcessingStatus" AS ENUM ('CREATED', 'UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "Asset" ("id" TEXT NOT NULL, "provider" "AssetProvider" NOT NULL, "kind" "AssetKind" NOT NULL, "status" "AssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD', "originalFilename" TEXT NOT NULL, "filename" TEXT NOT NULL, "storageKey" TEXT, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER, "checksum" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "readyAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3), "archivedAt" TIMESTAMP(3), "uploadedById" TEXT NOT NULL, CONSTRAINT "Asset_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");
CREATE INDEX "Asset_status_kind_createdAt_idx" ON "Asset"("status", "kind", "createdAt");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD COLUMN "primaryAssetId" TEXT;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_primaryAssetId_fkey" FOREIGN KEY ("primaryAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AssetReference" ("id" TEXT NOT NULL, "contentItemId" TEXT NOT NULL, "assetId" TEXT NOT NULL, "type" "AssetReferenceType" NOT NULL DEFAULT 'CONTENT_ATTACHMENT', "sortOrder" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AssetReference_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AssetReference_contentItemId_assetId_key" ON "AssetReference"("contentItemId", "assetId");
CREATE UNIQUE INDEX "AssetReference_contentItemId_sortOrder_key" ON "AssetReference"("contentItemId", "sortOrder");
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssetReference" ADD CONSTRAINT "AssetReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VideoAsset" ("assetId" TEXT NOT NULL, "libraryId" TEXT NOT NULL, "bunnyVideoId" TEXT NOT NULL, "processingStatus" "VideoProcessingStatus" NOT NULL DEFAULT 'CREATED', "processingProgress" INTEGER NOT NULL DEFAULT 0, "durationSeconds" INTEGER, "thumbnailUrl" TEXT, "lastWebhookAt" TIMESTAMP(3), "failureMetadata" JSONB, "attempt" INTEGER NOT NULL DEFAULT 1, CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("assetId"));
CREATE UNIQUE INDEX "VideoAsset_bunnyVideoId_key" ON "VideoAsset"("bunnyVideoId"); CREATE INDEX "VideoAsset_processingStatus_idx" ON "VideoAsset"("processingStatus");
ALTER TABLE "VideoAsset" ADD CONSTRAINT "VideoAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "BunnyStreamWebhookEvent" ("id" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "bunnyVideoId" TEXT NOT NULL, "status" INTEGER NOT NULL, "payload" JSONB NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BunnyStreamWebhookEvent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "BunnyStreamWebhookEvent_eventKey_key" ON "BunnyStreamWebhookEvent"("eventKey");

ALTER TABLE "AcademicGrade" ADD COLUMN "coverAssetId" TEXT; ALTER TABLE "Subject" ADD COLUMN "coverAssetId" TEXT; ALTER TABLE "Course" ADD COLUMN "coverAssetId" TEXT; ALTER TABLE "Chapter" ADD COLUMN "coverAssetId" TEXT; ALTER TABLE "Lesson" ADD COLUMN "coverAssetId" TEXT; ALTER TABLE "Section" ADD COLUMN "coverAssetId" TEXT;
ALTER TABLE "AcademicGrade" ADD CONSTRAINT "AcademicGrade_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Section" ADD CONSTRAINT "Section_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
