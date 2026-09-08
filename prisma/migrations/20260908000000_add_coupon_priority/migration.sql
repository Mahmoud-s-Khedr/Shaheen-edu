ALTER TABLE "Coupon" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "Coupon_isActive_startsAt_endsAt_idx";

CREATE INDEX "Coupon_isActive_startsAt_endsAt_priority_idx"
ON "Coupon"("isActive", "startsAt", "endsAt", "priority");
