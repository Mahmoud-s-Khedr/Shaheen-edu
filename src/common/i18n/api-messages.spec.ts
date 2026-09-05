import { HttpStatus } from '@nestjs/common';
import {
  errorCode,
  localizedError,
  localizedMessage,
  validationDetail,
} from './api-messages';

describe('API message localization', () => {
  it('returns both languages for known application messages', () => {
    expect(
      localizedMessage('Invalid credentials', HttpStatus.UNAUTHORIZED),
    ).toEqual({
      ar: 'بيانات تسجيل الدخول غير صحيحة',
      en: 'Invalid credentials',
    });
    expect(localizedError(HttpStatus.FORBIDDEN)).toEqual({
      ar: 'ممنوع',
      en: 'Forbidden',
    });
  });

  it('creates stable codes and bilingual validation details', () => {
    expect(errorCode('Invalid credentials', HttpStatus.UNAUTHORIZED)).toBe(
      'UNAUTHORIZED.INVALID_CREDENTIALS',
    );
    expect(
      validationDetail('profile.phone', 'isString', 'phone must be a string'),
    ).toEqual({
      field: 'profile.phone',
      code: 'VALIDATION.ISSTRING',
      message: { ar: 'يجب أن تكون القيمة نصاً', en: 'phone must be a string' },
    });
  });
});

describe('actionable validation translations', () => {
  it.each([
    ['minLength', 'password must be longer than or equal to 8 characters', '8'],
    [
      'maxLength',
      'title must be shorter than or equal to 200 characters',
      '200',
    ],
    ['min', 'score must not be less than 0.5', '0.5'],
    ['max', 'score must not be greater than 100', '100'],
    ['arrayMinSize', 'items must contain at least 1 elements', '1'],
    ['arrayMaxSize', 'items must contain no more than 20 elements', '20'],
    [
      'isEnum',
      'status must be one of the following values: DRAFT, PUBLISHED',
      'DRAFT, PUBLISHED',
    ],
    [
      'isIn',
      'type must be one of the following values: COURSE, CHAPTER',
      'COURSE, CHAPTER',
    ],
  ])('preserves %s constraints in Arabic', (constraint, message, expected) => {
    const detail = validationDetail('field', constraint, message);
    expect(detail.message.en).toBe(message);
    expect(detail.message.ar).toContain(expected);
  });

  it('explains unknown fields and individual array elements', () => {
    expect(
      validationDetail(
        'extra',
        'whitelistValidation',
        'property extra should not exist',
      ).message.ar,
    ).toContain('احذفه');
    expect(
      validationDetail(
        'indexes',
        'min',
        'each value in indexes must not be less than 0',
      ).message.ar,
    ).toContain('لكل عنصر');
  });

  it('provides actionable parser errors in both languages', () => {
    expect(
      localizedMessage('Request body must contain valid JSON', 400).ar,
    ).toContain('JSON');
    expect(localizedError(413).en).toBe('Payload Too Large');
    expect(localizedError(415).en).toBe('Unsupported Media Type');
  });
});
