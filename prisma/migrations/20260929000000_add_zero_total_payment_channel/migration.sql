-- A zero-total acquisition remains an order, but never starts a payment.
ALTER TYPE "PaymentChannel" ADD VALUE 'ZERO_TOTAL';
