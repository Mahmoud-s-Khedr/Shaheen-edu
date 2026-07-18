import type { ApiResponse } from './types.js';
import { redact } from './redaction.js';

export class JourneyAssertionError extends Error {
  constructor(
    message: string,
    readonly response?: ApiResponse,
  ) {
    super(message);
    this.name = 'JourneyAssertionError';
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new JourneyAssertionError(message);
}

export function expectStatus(response: ApiResponse, expected: number | number[]): void {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.status)) {
    throw new JourneyAssertionError(
      `${response.method} ${response.path}: expected HTTP ${allowed.join(' or ')}, received ${response.status}; body=${JSON.stringify(redact(response.body))}`,
      response,
    );
  }
}

export function expectString(value: unknown, field: string): asserts value is string {
  assert(typeof value === 'string' && value.length > 0, `Expected non-empty string: ${field}`);
}

export function expectAbsent(serialized: string, secret: string, label: string): void {
  assert(!serialized.includes(secret), `Sensitive ${label} appeared in the response`);
}
