import type { FastifyReply } from 'fastify';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';

export const REFRESH_COOKIE_NAME = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  configService: ConfigService<AppConfig, true>,
): void {
  const cookieSecure = configService.get('cookieSecure', { infer: true });
  const cookieSameSite = configService.get('cookieSameSite', { infer: true });
  const refreshTtlSeconds = configService.get('jwt', {
    infer: true,
  }).refreshTtlSeconds;
  void reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtlSeconds,
    signed: false,
  });
}

export function clearRefreshCookie(
  reply: FastifyReply,
  configService: ConfigService<AppConfig, true>,
): void {
  const cookieSecure = configService.get('cookieSecure', { infer: true });
  const cookieSameSite = configService.get('cookieSameSite', { infer: true });
  void reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: REFRESH_COOKIE_PATH,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    httpOnly: true,
  });
}
