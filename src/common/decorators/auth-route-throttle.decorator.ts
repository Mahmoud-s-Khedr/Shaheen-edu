import { Throttle } from '@nestjs/throttler';

const envInteger = (name: string, fallback: number): number =>
  parseInt(process.env[name] ?? String(fallback), 10);

/** Resolved per request after Nest has loaded and validated the environment. */
export const AuthRouteThrottle = () =>
  Throttle({
    default: {
      limit: () => envInteger('RATE_LIMIT_AUTH_ROUTE_LIMIT', 10),
      ttl: () => envInteger('RATE_LIMIT_AUTH_ROUTE_WINDOW_SECONDS', 60) * 1000,
    },
  });
