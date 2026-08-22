CREATE TABLE "VideoOutlineTopic" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSeconds" INTEGER,
    "endSeconds" INTEGER,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoOutlineTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoOutlineConcept" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoOutlineConcept_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoOutlineTopic_contentItemId_sortOrder_key"
  ON "VideoOutlineTopic"("contentItemId", "sortOrder");
CREATE INDEX "VideoOutlineTopic_contentItemId_idx"
  ON "VideoOutlineTopic"("contentItemId");
CREATE UNIQUE INDEX "VideoOutlineConcept_topicId_sortOrder_key"
  ON "VideoOutlineConcept"("topicId", "sortOrder");
CREATE INDEX "VideoOutlineConcept_topicId_idx"
  ON "VideoOutlineConcept"("topicId");

ALTER TABLE "VideoOutlineTopic"
  ADD CONSTRAINT "VideoOutlineTopic_contentItemId_fkey"
  FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoOutlineConcept"
  ADD CONSTRAINT "VideoOutlineConcept_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "VideoOutlineTopic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
