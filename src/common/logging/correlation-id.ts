import { randomUUID } from 'node:crypto';

const correlationIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function normalizeCorrelationId(value: unknown): string {
  return typeof value === 'string' && correlationIdPattern.test(value)
    ? value
    : randomUUID();
}
