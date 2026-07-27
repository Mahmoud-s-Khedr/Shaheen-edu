import { HttpStatus } from '@nestjs/common';
import { errorCode, localizedError, localizedMessage, validationDetail } from './api-messages';

describe('API message localization', () => {
  it('returns both languages for known application messages', () => {
    expect(localizedMessage('Invalid credentials', HttpStatus.UNAUTHORIZED)).toEqual({
      ar: 'بيانات تسجيل الدخول غير صحيحة', en: 'Invalid credentials',
    });
    expect(localizedError(HttpStatus.FORBIDDEN)).toEqual({ ar: 'ممنوع', en: 'Forbidden' });
  });

  it('creates stable codes and bilingual validation details', () => {
    expect(errorCode('Invalid credentials', HttpStatus.UNAUTHORIZED)).toBe('UNAUTHORIZED.INVALID_CREDENTIALS');
    expect(validationDetail('profile.phone', 'isString', 'phone must be a string')).toEqual({
      field: 'profile.phone', code: 'VALIDATION.ISSTRING', message: { ar: 'يجب أن تكون القيمة نصاً', en: 'phone must be a string' },
    });
  });
});
