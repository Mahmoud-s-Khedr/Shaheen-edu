import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie.util';
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

    setRefreshCookie(reply as never, 'refresh-token', config(true, 'none'));

    expect(reply.setCookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ secure: true, sameSite: 'none', maxAge: 900 }),
    );
  });

  it('uses the configured policy when clearing a cookie', () => {
    const reply = { clearCookie: jest.fn() };

    clearRefreshCookie(reply as never, config(false, 'strict'));

    expect(reply.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ secure: false, sameSite: 'strict' }),
    );
  });
});
