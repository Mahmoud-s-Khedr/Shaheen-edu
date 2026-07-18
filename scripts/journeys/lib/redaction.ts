const SENSITIVE_KEYS = /password|token|authorization|cookie|nationalid/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}
