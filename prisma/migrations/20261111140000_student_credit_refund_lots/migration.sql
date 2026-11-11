-- Refund lots retain their reward origin without extending the unused balance.
ALTER TABLE "StudentCreditGrant" ADD COLUMN "rootGrantId" TEXT;

CREATE INDEX "StudentCreditGrant_rootGrantId_idx" ON "StudentCreditGrant"("rootGrantId");

ALTER TABLE "StudentCreditGrant" ADD CONSTRAINT "StudentCreditGrant_rootGrantId_fkey"
FOREIGN KEY ("rootGrantId") REFERENCES "StudentCreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
