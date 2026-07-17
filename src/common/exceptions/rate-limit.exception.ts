import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown by AuthRateLimitService when a login/refresh/password-change
 * attempt exceeds its window threshold. GlobalExceptionFilter sets a
 * Retry-After response header for this exception type.
 */
export class RateLimitException extends HttpException {
  constructor(public readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many attempts. Please try again later.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
