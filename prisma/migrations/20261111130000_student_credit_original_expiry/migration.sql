-- Preserve the requested expiry independently of refund extensions.
ALTER TABLE "StudentCreditGrant" ADD COLUMN "originalExpiresAt" TIMESTAMP(3);

UPDATE "StudentCreditGrant" SET "originalExpiresAt" = "expiresAt";
