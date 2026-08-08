import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../../redis/redis.service';
import { RateLimitException } from '../../../common/exceptions/rate-limit.exception';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';

export type RateLimitPurpose =
  | 'student-login'
  | 'admin-login'
  | 'partner-login'
  | 'parent-login'
  | 'refresh'
  | 'password-change';

export type LoginRateLimitPurpose = Extract<
  RateLimitPurpose,
  'student-login' | 'admin-login' | 'partner-login' | 'parent-login'
>;

interface Threshold {
  maxAttempts: number;
  windowSeconds: number;
}

/**
 * Redis-backed fixed-window counter used for the security-critical
 * failed-login lockout/backoff logic (separate from the generic
 * @nestjs/throttler in-memory limiter used for per-route rate limiting).
 *
 * Never stores the raw submitted identifier - only sha256/HMAC-derived keys.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

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
    const identifierThreshold = this.identifierThreshold(purpose);
    await this.checkAndIncrement(
      `ratelimit:login:${purpose}:${hashedIdentifier}`,
      identifierThreshold,
    );
    if (ip) {
      await this.checkAndIncrement(
        `ratelimit:login:${purpose}:ip:${ip}`,
        this.ipThreshold(),
      );
    }
  }

  /**
   * Login lockout is keyed to failed credentials only. The IP counter still
   * applies to every request so a caller cannot bypass volumetric protection
   * by cycling through identifiers.
   */
  async assertLoginAllowed(
    purpose: LoginRateLimitPurpose,
    hashedIdentifier: string,
    ip: string | undefined,
  ): Promise<void> {
    const identifierKey = this.identifierKey(purpose, hashedIdentifier);
    const identifierThreshold = this.identifierThreshold(purpose);
    const currentCount = Number(
      (await this.redisService.client.get(identifierKey)) ?? 0,
    );
    if (currentCount >= identifierThreshold.maxAttempts) {
      const ttl = await this.redisService.client.ttl(identifierKey);
      throw new RateLimitException(
        ttl > 0 ? ttl : identifierThreshold.windowSeconds,
      );
    }

    if (ip) {
      await this.checkAndIncrement(
        `ratelimit:login:${purpose}:ip:${ip}`,
        this.ipThreshold(),
      );
    }
  }

  async recordLoginFailure(
    purpose: LoginRateLimitPurpose,
    hashedIdentifier: string,
  ): Promise<void> {
    await this.checkAndIncrement(
      this.identifierKey(purpose, hashedIdentifier),
      this.identifierThreshold(purpose),
    );
  }

  async clearLoginFailures(
    purpose: LoginRateLimitPurpose,
    hashedIdentifier: string,
  ): Promise<void> {
    await this.redisService.client.del(
      this.identifierKey(purpose, hashedIdentifier),
    );
  }

  private identifierKey(purpose: RateLimitPurpose, hashedIdentifier: string) {
    return `ratelimit:login:${purpose}:${hashedIdentifier}`;
  }

  private identifierThreshold(purpose: RateLimitPurpose): Threshold {
    const identifier = this.configService.get('rateLimit', {
      infer: true,
    }).identifier;
    const thresholds: Record<RateLimitPurpose, Threshold> = {
      'student-login': identifier.studentLogin,
      'admin-login': identifier.adminLogin,
      'partner-login': identifier.partnerLogin,
      'parent-login': identifier.parentLogin,
      refresh: identifier.refresh,
      'password-change': identifier.passwordChange,
    };
    return thresholds[purpose];
  }

  private ipThreshold(): Threshold {
    return this.configService.get('rateLimit', { infer: true }).ip;
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
