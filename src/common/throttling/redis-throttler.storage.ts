import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
  local blockTtl = redis.call('TTL', KEYS[2])
  if blockTtl > 0 then
    return {ARGV[2] + 1, 0, 1, blockTtl}
  end

  local hits = redis.call('INCR', KEYS[1])
  if hits == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])

  if hits > tonumber(ARGV[2]) then
    redis.call('SET', KEYS[2], '1', 'EX', ARGV[3])
    redis.call('DEL', KEYS[1])
    return {hits, ttl, 1, ARGV[3]}
  end

  return {hits, ttl, 0, 0}
`;

/**
 * Shared fixed-window throttler storage. The script makes increment, expiry,
 * and blocking atomic, so all API replicas enforce one rate-limit budget.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const ttlSeconds = Math.max(1, Math.ceil(ttl / 1000));
    const blockSeconds = Math.max(1, Math.ceil(blockDuration / 1000));
    const values = (await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `throttler:${throttlerName}:hits:${key}`,
      `throttler:${throttlerName}:blocked:${key}`,
      String(ttlSeconds),
      String(limit),
      String(blockSeconds),
    )) as [number, number, number, number];
    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = values;
    return {
      totalHits: Number(totalHits),
      timeToExpire: Math.max(0, Number(timeToExpire)),
      isBlocked: Number(isBlocked) === 1,
      timeToBlockExpire: Math.max(0, Number(timeToBlockExpire)),
    };
  }
}
