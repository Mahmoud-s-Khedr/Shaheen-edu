import {
  ADMIN_REFRESH_COOKIE_NAME,
  APP_REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  refreshCookieScopeForRole,
  refreshCookieScopeForRequest,
  setRefreshCookie,
} from './refresh-cookie.util';
import { Role } from '../../../common/types/roles.enum';
import type { AppConfig } from '../../../config/configuration';
import type { ConfigService } from '@nestjs/config';

function config(
  cookieSecure: boolean,
  cookieSameSite: AppConfig['cookieSameSite'],
) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'cookieSecure') return cookieSecure;
      if (key === 'cookieSameSite') return cookieSameSite;
      if (key === 'jwt') return { refreshTtlSeconds: 900 };
      return undefined;
    }),
  } as unknown as ConfigService<AppConfig, true>;
}

describe('refresh cookies', () => {
  it('uses the configured cross-site policy when setting a cookie', () => {
    const reply = { setCookie: jest.fn() };

    setRefreshCookie(
      reply as never,
      'refresh-token',
      config(true, 'none'),
      'app',
    );

    expect(reply.setCookie).toHaveBeenCalledWith(
      APP_REFRESH_COOKIE_NAME,
      'refresh-token',
      expect.objectContaining({ secure: true, sameSite: 'none', maxAge: 900 }),
    );
  });

  it('uses the configured policy when clearing a cookie', () => {
    const reply = { clearCookie: jest.fn() };

    clearRefreshCookie(reply as never, config(false, 'strict'), 'admin');

    expect(reply.clearCookie).toHaveBeenCalledWith(
      ADMIN_REFRESH_COOKIE_NAME,
      expect.objectContaining({ secure: false, sameSite: 'strict' }),
    );
  });

  it('selects the correct namespace only for exact production frontend origins', () => {
    const cookies = {
      [APP_REFRESH_COOKIE_NAME]: 'app-token',
      [ADMIN_REFRESH_COOKIE_NAME]: 'admin-token',
    };

    expect(
      refreshCookieScopeForRequest({
        origin: 'https://app.jibal-platform.com',
        cookies,
      }),
    ).toBe('app');
    expect(
      refreshCookieScopeForRequest({
        origin: 'https://admin.jibal-platform.com',
        cookies,
      }),
    ).toBe('admin');
    expect(
      refreshCookieScopeForRequest({
        origin: 'https://jibal-platform.com',
        cookies,
      }),
    ).toBeUndefined();
    expect(
      refreshCookieScopeForRequest({
        origin: 'https://www.jibal-platform.com',
        cookies,
      }),
    ).toBeUndefined();
    expect(
      refreshCookieScopeForRequest({
        origin: 'https://admin.jibal-platform.com.attacker.example',
        cookies,
      }),
    ).toBeUndefined();
    expect(
      refreshCookieScopeForRequest({ origin: 'not an origin', cookies }),
    ).toBeUndefined();
    expect(refreshCookieScopeForRequest({ cookies })).toBeUndefined();
  });

  it('maps students to app cookies and staff and partners to admin cookies', () => {
    expect(refreshCookieScopeForRole(Role.STUDENT)).toBe('app');
    expect(refreshCookieScopeForRole(Role.ADMIN)).toBe('admin');
    expect(refreshCookieScopeForRole(Role.SUPER_ADMIN)).toBe('admin');
    expect(refreshCookieScopeForRole(Role.PARTNER)).toBe('admin');
  });
});
