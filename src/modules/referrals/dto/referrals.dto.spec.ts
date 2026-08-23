import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminReferralReportingQueryDto } from './referrals.dto';

describe('AdminReferralReportingQueryDto', () => {
  it('accepts the required partner ID alongside the reporting period', () => {
    const query = plainToInstance(AdminReferralReportingQueryDto, {
      partnerUserId: 'partner-123', from: '2026-08-01', to: '2026-08-31', granularity: 'day',
    });

    expect(validateSync(query, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('requires the partner ID', () => {
    const query = plainToInstance(AdminReferralReportingQueryDto, {});

    expect(validateSync(query).some((error) => error.property === 'partnerUserId')).toBe(true);
  });
});
