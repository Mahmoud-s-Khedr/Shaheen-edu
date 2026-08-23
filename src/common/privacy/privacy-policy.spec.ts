import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../types/roles.enum';
import { PrivacyPolicy } from './privacy-policy';

describe('PrivacyPolicy', () => {
  const policy = new PrivacyPolicy({
    supportReasonAllowlist: ['SUPPORT_CASE', 'PAYMENT_DISPUTE'],
  });

  it('requires an approved configured reason for sensitive Student 360 sections', () => {
    expect(() =>
      policy.assertStudent360Access(Role.ADMIN, ['CONTACT']),
    ).toThrow(BadRequestException);
    expect(() =>
      policy.assertStudent360Access(Role.ADMIN, ['CONTACT'], 'other'),
    ).toThrow(BadRequestException);
    expect(
      policy.assertStudent360Access(Role.ADMIN, ['CONTACT'], 'SUPPORT_CASE'),
    ).toBe('SUPPORT_CASE');
  });

  it('enforces section and role boundaries before any data query', () => {
    expect(() =>
      policy.assertStudent360Access(
        Role.ADMIN,
        ['AUDIT_EVENTS'],
        'SUPPORT_CASE',
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      policy.assertStudent360Access(Role.STUDENT, ['PROFILE']),
    ).toThrow(ForbiddenException);
  });
});
