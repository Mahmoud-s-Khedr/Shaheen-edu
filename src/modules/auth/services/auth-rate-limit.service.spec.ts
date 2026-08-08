import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';
import { AuthRateLimitService } from './auth-rate-limit.service';

class InMemoryRedis {
  private readonly values = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    const value = this.values.get(key);
    return value === undefined ? null : String(value);
  }

  async incr(key: string): Promise<number> {
    const value = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, value);
    return value;
  }

  async expire(): Promise<number> {
    return 1;
  }

  async ttl(): Promise<number> {
    return 900;
  }

  async del(key: string): Promise<number> {
    return this.values.delete(key) ? 1 : 0;
  }
}

describe('AuthRateLimitService', () => {
  const identifier = AuthRateLimitService.hashIdentifier(
    'student@example.test',
  );
  const config = {
    get: () => ({
      identifier: {
        studentLogin: { maxAttempts: 5, windowSeconds: 900 },
        adminLogin: { maxAttempts: 5, windowSeconds: 900 },
        partnerLogin: { maxAttempts: 5, windowSeconds: 900 },
        parentLogin: { maxAttempts: 3, windowSeconds: 1800 },
        refresh: { maxAttempts: 20, windowSeconds: 900 },
        passwordChange: { maxAttempts: 5, windowSeconds: 900 },
      },
      ip: { maxAttempts: 20, windowSeconds: 900 },
    }),
  };

  it('locks an identifier only after failed login attempts and clears it on success', async () => {
    const client = new InMemoryRedis();
    const service = new AuthRateLimitService(
      { client } as never,
      config as never,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.assertLoginAllowed('student-login', identifier, undefined);
      await service.recordLoginFailure('student-login', identifier);
    }

    await expect(
      service.assertLoginAllowed('student-login', identifier, undefined),
    ).rejects.toBeInstanceOf(RateLimitException);

    await service.clearLoginFailures('student-login', identifier);
    await expect(
      service.assertLoginAllowed('student-login', identifier, undefined),
    ).resolves.toBeUndefined();
  });
});
