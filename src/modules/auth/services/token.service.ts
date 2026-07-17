import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import type {
  ParentAccessTokenPayload,
  UserAccessTokenPayload,
} from '../../../common/types/jwt-payload.types';
import type { Role } from '../../../common/types/roles.enum';
import type { AppConfig } from '../../../config/configuration';

@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  signUserAccessToken(params: {
    userId: string;
    role: Role;
    sessionId: string;
  }): string {
    const jwtConfig = this.configService.get('jwt', { infer: true });
    const payload: Omit<UserAccessTokenPayload, 'iat' | 'exp'> = {
      sub: params.userId,
      role: params.role,
      sid: params.sessionId,
      typ: 'user_access',
    };
    return jwt.sign(payload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessTtlSeconds,
    });
  }

  signParentAccessToken(params: {
    parentSessionId: string;
    activeStudentId: string | null;
  }): string {
    const jwtConfig = this.configService.get('jwt', { infer: true });
    const payload: Omit<ParentAccessTokenPayload, 'iat' | 'exp'> = {
      pid: params.parentSessionId,
      active: params.activeStudentId,
      typ: 'parent_access',
    };
    return jwt.sign(payload, jwtConfig.parentAccessSecret, {
      expiresIn: jwtConfig.parentAccessTtlSeconds,
    });
  }

  /** Opaque random refresh token (NOT a JWT). Raw value is cookie-delivered only once. */
  generateOpaqueRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  hashOpaqueToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  get accessTtlSeconds(): number {
    return this.configService.get('jwt', { infer: true }).accessTtlSeconds;
  }

  get refreshTtlSeconds(): number {
    return this.configService.get('jwt', { infer: true }).refreshTtlSeconds;
  }

  get parentAccessTtlSeconds(): number {
    return this.configService.get('jwt', { infer: true })
      .parentAccessTtlSeconds;
  }
}
