CREATE TYPE "ArchivedAccessResourceType" AS ENUM ('ACADEMIC_GRADE', 'SUBJECT', 'COURSE', 'CHAPTER', 'LESSON', 'SECTION');

CREATE TABLE "ArchivedAccessSnapshot" (
  "id" TEXT NOT NULL,
  "studentUserId" TEXT NOT NULL,
  "resourceType" "ArchivedAccessResourceType" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "sourceEntitlementId" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArchivedAccessSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArchivedAccessSnapshot_studentUserId_resourceType_resourceId_key" ON "ArchivedAccessSnapshot"("studentUserId", "resourceType", "resourceId");
CREATE INDEX "ArchivedAccessSnapshot_studentUserId_revokedAt_idx" ON "ArchivedAccessSnapshot"("studentUserId", "revokedAt");
CREATE INDEX "ArchivedAccessSnapshot_resourceType_resourceId_idx" ON "ArchivedAccessSnapshot"("resourceType", "resourceId");

ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "StudentProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_sourceEntitlementId_fkey" FOREIGN KEY ("sourceEntitlementId") REFERENCES "StudentEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ArchivedAccessSnapshot" ADD CONSTRAINT "ArchivedAccessSnapshot_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
