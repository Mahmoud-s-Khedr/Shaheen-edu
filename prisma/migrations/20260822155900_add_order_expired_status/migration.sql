-- PostgreSQL requires an enum value to be committed before it can be used by
-- subsequent order-state data updates and constraints.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
