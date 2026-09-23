import type { FastifyReply } from 'fastify';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import { Role } from '../../../common/types/roles.enum';

export const APP_REFRESH_COOKIE_NAME = 'app_refresh_token';
export const ADMIN_REFRESH_COOKIE_NAME = 'admin_refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
export const APP_FRONTEND_ORIGIN = 'https://app.jibal-platform.com';
export const ADMIN_FRONTEND_ORIGIN = 'https://admin.jibal-platform.com';

export type RefreshCookieScope = 'app' | 'admin';

export function refreshCookieScopeForRole(role: Role): RefreshCookieScope {
  return role === Role.STUDENT ? 'app' : 'admin';
}

export function refreshCookieName(scope: RefreshCookieScope): string {
  return scope === 'admin'
    ? ADMIN_REFRESH_COOKIE_NAME
    : APP_REFRESH_COOKIE_NAME;
}

/**
 * The browser sends both API-host cookies to /auth endpoints. Select the
 * application namespace from the requesting frontend's exact Origin instead
 * of letting one application refresh the other's session. Refresh is a
 * browser-only endpoint: requests without a recognized production Origin are
 * rejected, even if they carry a cookie.
 */
export function refreshCookieScopeForRequest(params: {
  origin?: string | string[];
  cookies?: Record<string, string | undefined>;
}): RefreshCookieScope | undefined {
  if (Array.isArray(params.origin)) return undefined;
  if (params.origin === APP_FRONTEND_ORIGIN) return 'app';
  if (params.origin === ADMIN_FRONTEND_ORIGIN) return 'admin';
  return undefined;
}

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  configService: ConfigService<AppConfig, true>,
  scope: RefreshCookieScope,
): void {
  const cookieSecure = configService.get('cookieSecure', { infer: true });
  const cookieSameSite = configService.get('cookieSameSite', { infer: true });
  const refreshTtlSeconds = configService.get('jwt', {
    infer: true,
  }).refreshTtlSeconds;
  void reply.setCookie(refreshCookieName(scope), token, {
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
  scope: RefreshCookieScope,
): void {
  const cookieSecure = configService.get('cookieSecure', { infer: true });
  const cookieSameSite = configService.get('cookieSameSite', { infer: true });
  void reply.clearCookie(refreshCookieName(scope), {
    path: REFRESH_COOKIE_PATH,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    httpOnly: true,
  });
}
