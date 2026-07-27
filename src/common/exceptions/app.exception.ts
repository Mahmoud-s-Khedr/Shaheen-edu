import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Base application exception carrying a stable machine-readable error code
 * alongside the human-readable HTTP exception message. Prefer throwing this
 * (or a NestJS built-in HttpException) over raw Error so the
 * GlobalExceptionFilter can produce a consistent response shape.
 */
export class AppException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly code: ErrorCode | string = ErrorCode.VALIDATION_FAILED,
  ) {
    super(message, status);
  }
}
