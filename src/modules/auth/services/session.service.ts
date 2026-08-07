import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TokenService } from './token.service';
import { AccountStatus } from '../../../common/types/roles.enum';
import type { AuthSession, Role, User } from '@prisma/client';

export interface CreatedSession {
  accessToken: string;
  refreshToken: string;
  session: AuthSession;
}

export interface RotateResult {
  accessToken: string;
  refreshToken: string;
  user: User;
  session: AuthSession;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async createSession(params: {
    userId: string;
    role: Role;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CreatedSession> {
    const refreshToken = this.tokenService.generateOpaqueRefreshToken();
    const refreshTokenHash = this.tokenService.hashOpaqueToken(refreshToken);
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + this.tokenService.refreshTtlSeconds * 1000,
    );

    const session = await this.prisma.authSession.create({
      data: {
        userId: params.userId,
        refreshTokenHash,
        familyId,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    const accessToken = this.tokenService.signUserAccessToken({
      userId: params.userId,
      role: params.role,
      sessionId: session.id,
    });

    return { accessToken, refreshToken, session };
  }

  /**
   * Refresh rotation + reuse detection.
   * 1. Look up AuthSession by sha256(rawToken).
   * 2. Not found -> generic 401.
   * 3. Found but revoked=true -> reuse of an already-rotated token: revoke
   *    the entire family, 401.
   * 4. Found, valid, but expired -> 401, mark revoked.
   * 5. Found, valid, but user.status !== ACTIVE -> 401.
   * 6. Otherwise: revoke current row, create new row (same familyId), link
   *    replacedBySessionId, sign new access JWT, return new refresh token.
   */
  async rotate(params: {
    rawToken: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RotateResult> {
    const refreshTokenHash = this.tokenService.hashOpaqueToken(params.rawToken);
    const newRefreshToken = this.tokenService.generateOpaqueRefreshToken();
    const newRefreshTokenHash =
      this.tokenService.hashOpaqueToken(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + this.tokenService.refreshTtlSeconds * 1000,
    );

    const rotation = await this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({
        where: { refreshTokenHash },
        include: { user: true },
      });
      if (!session) {
        return { kind: 'not-found' as const };
      }

      if (session.revoked) {
        return { kind: 'reuse' as const, familyId: session.familyId };
      }

      if (session.expiresAt < new Date()) {
        await tx.authSession.updateMany({
          where: { id: session.id, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        });
        return { kind: 'unauthorized' as const };
      }

      if (
        session.user.status !== AccountStatus.ACTIVE ||
        session.user.mustChangePassword
      ) {
        return { kind: 'unauthorized' as const };
      }

      // Claim the source row before creating a successor. A concurrent caller
      // that read the same token will update zero rows once this commits.
      const claimed = await tx.authSession.updateMany({
        where: { id: session.id, refreshTokenHash, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
      if (claimed.count !== 1) {
        return { kind: 'reuse' as const, familyId: session.familyId };
      }

      const created = await tx.authSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          familyId: session.familyId,
          expiresAt: newExpiresAt,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: {
          replacedBySessionId: created.id,
        },
      });
      return { kind: 'success' as const, session, newSession: created };
    });

    if (rotation.kind === 'reuse') {
      await this.prisma.authSession.updateMany({
        where: { familyId: rotation.familyId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedException('Unauthorized');
    }
    if (rotation.kind !== 'success') {
      throw new UnauthorizedException('Unauthorized');
    }

    const accessToken = this.tokenService.signUserAccessToken({
      userId: rotation.session.user.id,
      role: rotation.session.user.role,
      sessionId: rotation.newSession.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: rotation.session.user,
      session: rotation.newSession,
    };
  }

  async revokeByRawToken(rawToken: string): Promise<void> {
    const refreshTokenHash = this.tokenService.hashOpaqueToken(rawToken);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }
}
