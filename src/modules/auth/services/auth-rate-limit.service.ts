import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';

export type RateLimitPurpose =
  | 'student-login'
  | 'admin-login'
  | 'partner-login'
  | 'parent-login'
  | 'refresh'
  | 'password-change';

interface Threshold {
  maxAttempts: number;
  windowSeconds: number;
}

const IDENTIFIER_THRESHOLDS: Record<RateLimitPurpose, Threshold> = {
  'student-login': { maxAttempts: 5, windowSeconds: 900 },
  'admin-login': { maxAttempts: 5, windowSeconds: 900 },
  'partner-login': { maxAttempts: 5, windowSeconds: 900 },
  'parent-login': { maxAttempts: 3, windowSeconds: 1800 },
  refresh: { maxAttempts: 20, windowSeconds: 900 },
  'password-change': { maxAttempts: 5, windowSeconds: 900 },
};

const IP_THRESHOLD: Threshold = { maxAttempts: 20, windowSeconds: 900 };

/**
 * Redis-backed fixed-window counter used for the security-critical
 * failed-login lockout/backoff logic (separate from the generic
 * @nestjs/throttler in-memory limiter used for per-route rate limiting).
 *
 * Never stores the raw submitted identifier - only sha256/HMAC-derived keys.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  static hashIdentifier(loginIdentifier: string): string {
    return crypto.createHash('sha256').update(loginIdentifier).digest('hex');
  }

  static hashParentIdentifier(
    normalizedNationalId: string,
    normalizedParentPhone: string,
  ): string {
    return crypto
      .createHash('sha256')
      .update(`${normalizedNationalId}:${normalizedParentPhone}`)
      .digest('hex');
  }

  async assertNotLimited(
    purpose: RateLimitPurpose,
    hashedIdentifier: string,
    ip: string | undefined,
  ): Promise<void> {
    const identifierThreshold = IDENTIFIER_THRESHOLDS[purpose];
    await this.checkAndIncrement(
      `ratelimit:login:${purpose}:${hashedIdentifier}`,
      identifierThreshold,
    );
    if (ip) {
      await this.checkAndIncrement(
        `ratelimit:login:${purpose}:ip:${ip}`,
        IP_THRESHOLD,
      );
    }
  }

  private async checkAndIncrement(
    key: string,
    threshold: Threshold,
  ): Promise<void> {
    const client = this.redisService.client;
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, threshold.windowSeconds);
    }
    if (count > threshold.maxAttempts) {
      const ttl = await client.ttl(key);
      const retryAfter = ttl > 0 ? ttl : threshold.windowSeconds;
      throw new RateLimitException(retryAfter);
    }
  }
}
