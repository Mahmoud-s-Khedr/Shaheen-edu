import { safeErrorRecord } from './error-record';

describe('safeErrorRecord', () => {
  it('keeps the fingerprint stable while omitting the exception message', () => {
    const error = new Error('national-id=29801011234567');
    error.name = 'ProviderError';
    error.stack = [
      'ProviderError: national-id=29801011234567',
      '    at request (/app/dist/modules/provider/client.js:42:9)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');

    const record = safeErrorRecord(error);

    expect(record).toEqual({
      errorType: 'Error',
      errorFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      errorStack: expect.stringContaining(
        '/app/dist/modules/provider/client.js',
      ),
    });
    expect(record.errorStack).not.toContain('29801011234567');
    expect(record.errorFingerprint).toBe(
      safeErrorRecord(error).errorFingerprint,
    );
  });

  it('has a bounded fallback for non-Error throws', () => {
    expect(safeErrorRecord('unexpected')).toEqual({
      errorType: 'UnknownError',
      errorFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/),
      errorStack: 'UnknownError',
    });
  });
});
