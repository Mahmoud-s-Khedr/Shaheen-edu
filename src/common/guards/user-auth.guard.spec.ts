import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { UserAuthGuard } from './user-auth.guard';
import { Role, AccountStatus } from '../types/roles.enum';

const secret = 'unit-test-access-secret';

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function token(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { typ: 'user_access', sid: 'session-1', sub: 'user-1', role: Role.STUDENT, ...overrides },
    secret,
  );
}

describe('UserAuthGuard', () => {
  const prisma = {
    authSession: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const reflector = { getAllAndOverride: jest.fn() };
  const config = { get: jest.fn(() => ({ accessSecret: secret })) };
  const guard = new UserAuthGuard(reflector as any, config as any, prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects an access token when its session belongs to another user', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(false);
    prisma.authSession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'other-user', revoked: false, expiresAt: new Date(Date.now() + 60_000) });

    await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${token()}` } }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks a forced-password-change user from ordinary routes', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(false);
    prisma.authSession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'user-1', revoked: false, expiresAt: new Date(Date.now() + 60_000) });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.STUDENT, status: AccountStatus.ACTIVE, mustChangePassword: true });

    await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${token()}` } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a forced-password-change user on an explicitly permitted route', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(false).mockReturnValueOnce(true);
    prisma.authSession.findUnique.mockResolvedValue({ id: 'session-1', userId: 'user-1', revoked: false, expiresAt: new Date(Date.now() + 60_000) });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', role: Role.STUDENT, status: AccountStatus.ACTIVE, mustChangePassword: true });
    const request: Record<string, any> = { headers: { authorization: `Bearer ${token()}` } };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: Role.STUDENT, sessionId: 'session-1' });
  });
});
