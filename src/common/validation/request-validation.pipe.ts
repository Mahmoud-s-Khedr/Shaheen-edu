import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import {
  localizedMessage,
  validationDetail,
  type ValidationDetail,
} from '../i18n/api-messages';

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]) => validationDetail(field, constraint, message),
    );
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationException(errors: ValidationError[]) {
  const details = flattenValidationErrors(errors);
  return new BadRequestException({
    code: 'BAD_REQUEST.VALIDATION_FAILED',
    message: details[0]?.message ?? localizedMessage('Validation failed', 400),
    details,
  });
}

/** Shared request validation for the server and HTTP contract tests. */
export function createRequestValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    validationError: { target: false, value: false },
    exceptionFactory: createValidationException,
  });
}
