import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  it('uses atomic Redis state with second-based expiries', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([2, 2, 0, 0]) };
    const storage = new RedisThrottlerStorage(redis as any);

    await expect(
      storage.increment('route-key', 1_500, 10, 2_500, 'default'),
    ).resolves.toEqual({
      totalHits: 2,
      timeToExpire: 2,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      'throttler:default:hits:route-key',
      'throttler:default:blocked:route-key',
      '2',
      '10',
      '3',
    );
  });

  it('returns the shared blocked state to every API replica', async () => {
    const redis = { eval: jest.fn().mockResolvedValue([11, 8, 1, 3]) };
    const storage = new RedisThrottlerStorage(redis as any);

    await expect(
      storage.increment('route-key', 60_000, 10, 3_000, 'default'),
    ).resolves.toEqual({
      totalHits: 11,
      timeToExpire: 8,
      isBlocked: true,
      timeToBlockExpire: 3,
    });
  });
});
