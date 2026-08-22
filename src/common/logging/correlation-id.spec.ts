import { normalizeCorrelationId } from './correlation-id';

describe('normalizeCorrelationId', () => {
  it('retains a bounded safe caller-supplied identifier', () => {
    expect(normalizeCorrelationId('web:checkout-123_abc')).toBe(
      'web:checkout-123_abc',
    );
  });

  it.each(['', 'line\nbreak', 'x'.repeat(129), ['not', 'a', 'string']])(
    'replaces an unsafe identifier',
    (value) => {
      expect(normalizeCorrelationId(value)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
});
