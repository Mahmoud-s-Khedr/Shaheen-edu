-- Curated public reviews. Screenshot files remain private storage objects and
-- are exposed only through the published-testimonial access endpoint.
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "reviewText" TEXT,
    "reviewerName" TEXT,
    "screenshotAltText" TEXT,
    "screenshotAssetId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Testimonial_content_check" CHECK ("reviewText" IS NOT NULL OR "screenshotAssetId" IS NOT NULL),
    CONSTRAINT "Testimonial_screenshot_alt_check" CHECK ("screenshotAssetId" IS NULL OR "screenshotAltText" IS NOT NULL)
);

CREATE UNIQUE INDEX "Testimonial_screenshotAssetId_key" ON "Testimonial"("screenshotAssetId");
CREATE UNIQUE INDEX "Testimonial_active_sortOrder_key" ON "Testimonial"("sortOrder")
  WHERE "status" <> 'ARCHIVED';
CREATE INDEX "Testimonial_status_sortOrder_id_idx" ON "Testimonial"("status", "sortOrder", "id");

ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_screenshotAssetId_fkey"
  FOREIGN KEY ("screenshotAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
