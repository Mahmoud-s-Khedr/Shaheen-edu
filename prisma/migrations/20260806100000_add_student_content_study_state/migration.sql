CREATE TABLE "StudentContentStudyState" (
    "id" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL,
    "playbackPositionSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentContentStudyState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentContentStudyState_studentUserId_contentItemId_key" ON "StudentContentStudyState"("studentUserId", "contentItemId");
CREATE INDEX "StudentContentStudyState_studentUserId_lastOpenedAt_id_idx" ON "StudentContentStudyState"("studentUserId", "lastOpenedAt", "id");
CREATE INDEX "StudentContentStudyState_contentItemId_idx" ON "StudentContentStudyState"("contentItemId");

ALTER TABLE "StudentContentStudyState" ADD CONSTRAINT "StudentContentStudyState_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentContentStudyState" ADD CONSTRAINT "StudentContentStudyState_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
