import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { TokenService } from './token.service';
import { Role } from '../../../common/types/roles.enum';
import type { AppConfig } from '../../../config/configuration';

function makeConfigService(): ConfigService<AppConfig, true> {
  return {
    get: (key: string) => {
      if (key === 'jwt') {
        return {
          accessSecret: 'access-secret-xxxxxxxxxxxxxxxxxxxxxxxx',
          accessTtlSeconds: 900,
          refreshTtlSeconds: 2_592_000,
          parentAccessSecret: 'parent-secret-xxxxxxxxxxxxxxxxxxxxxxxx',
          parentAccessTtlSeconds: 1800,
        };
      }
      throw new Error(`unexpected key ${key}`);
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe('TokenService', () => {
  const configService = makeConfigService();
  const service = new TokenService(configService);

  describe('signUserAccessToken', () => {
    it('produces a token whose claims are exactly sub/role/sid/typ/iat/exp', () => {
      const token = service.signUserAccessToken({
        userId: 'user-1',
        role: Role.STUDENT,
        sessionId: 'session-1',
      });
      const decoded = jwt.verify(
        token,
        'access-secret-xxxxxxxxxxxxxxxxxxxxxxxx',
      ) as Record<string, unknown>;

      expect(decoded.sub).toBe('user-1');
      expect(decoded.role).toBe(Role.STUDENT);
      expect(decoded.sid).toBe('session-1');
      expect(decoded.typ).toBe('user_access');
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');

      const keys = Object.keys(decoded).sort();
      expect(keys).toEqual(['exp', 'iat', 'role', 'sid', 'sub', 'typ']);
    });

    it('never includes PII fields', () => {
      const token = service.signUserAccessToken({
        userId: 'user-1',
        role: Role.STUDENT,
        sessionId: 'session-1',
      });
      const decoded = jwt.decode(token) as Record<string, unknown>;
      for (const forbidden of [
        'nationalId',
        'phone',
        'email',
        'password',
        'fullName',
      ]) {
        expect(decoded[forbidden]).toBeUndefined();
      }
    });
  });

  describe('signParentAccessToken', () => {
    it('produces a token whose claims are exactly pid/active/typ/iat/exp', () => {
      const token = service.signParentAccessToken({
        parentSessionId: 'parent-session-1',
        activeStudentId: null,
      });
      const decoded = jwt.verify(
        token,
        'parent-secret-xxxxxxxxxxxxxxxxxxxxxxxx',
      ) as Record<string, unknown>;

      expect(decoded.pid).toBe('parent-session-1');
      expect(decoded.active).toBeNull();
      expect(decoded.typ).toBe('parent_access');
      expect(typeof decoded.iat).toBe('number');
      expect(typeof decoded.exp).toBe('number');

      const keys = Object.keys(decoded).sort();
      expect(keys).toEqual(['active', 'exp', 'iat', 'pid', 'typ']);
    });

    it('never includes PII fields', () => {
      const token = service.signParentAccessToken({
        parentSessionId: 'parent-session-1',
        activeStudentId: 'student-1',
      });
      const decoded = jwt.decode(token) as Record<string, unknown>;
      for (const forbidden of ['nationalId', 'phone', 'parentPhone']) {
        expect(decoded[forbidden]).toBeUndefined();
      }
    });
  });

  describe('generateOpaqueRefreshToken / hashOpaqueToken', () => {
    it('generates distinct opaque tokens', () => {
      const a = service.generateOpaqueRefreshToken();
      const b = service.generateOpaqueRefreshToken();
      expect(a).not.toBe(b);
    });

    it('hashes deterministically', () => {
      const raw = service.generateOpaqueRefreshToken();
      expect(service.hashOpaqueToken(raw)).toBe(service.hashOpaqueToken(raw));
    });
  });
});
