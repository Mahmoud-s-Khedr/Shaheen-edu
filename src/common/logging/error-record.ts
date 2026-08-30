import { createHash } from 'node:crypto';

export interface SafeErrorRecord {
  errorType: string;
  errorFingerprint: string;
  errorStack: string;
}

/**
 * Produces a searchable error record without copying a potentially sensitive
 * exception message into telemetry. The fingerprint remains stable for the
 * same error type and top application frame.
 */
export function safeErrorRecord(exception: unknown): SafeErrorRecord {
  const errorType =
    exception instanceof Error && exception.constructor.name
      ? exception.constructor.name
      : 'UnknownError';
  const frames = exception instanceof Error ? stackFrames(exception.stack) : [];
  const topFrame = frames.find(isApplicationFrame) ?? frames[0] ?? 'no_stack';
  const errorFingerprint = createHash('sha256')
    .update(`${errorType}\n${topFrame}`)
    .digest('hex')
    .slice(0, 16);

  return {
    errorType,
    errorFingerprint,
    errorStack: [errorType, ...frames].join('\n'),
  };
}

function stackFrames(stack: string | undefined): string[] {
  if (!stack) return [];
  // The first stack line includes Error.message, which may contain user input
  // or provider data. Frames provide the diagnostic value without that risk.
  return stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function isApplicationFrame(frame: string): boolean {
  return /(?:\/src\/|\/dist\/)/.test(frame) && !/\/node_modules\//.test(frame);
}
