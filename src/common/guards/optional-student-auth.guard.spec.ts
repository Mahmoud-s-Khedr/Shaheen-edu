import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { AccountStatus, Role } from '../types/roles.enum';
import { OptionalStudentAuthGuard } from './optional-student-auth.guard';

describe('OptionalStudentAuthGuard', () => {
  const secret = 'test-access-secret-with-enough-entropy';

  function setup(overrides: Record<string, unknown> = {}) {
    const request: any = { headers: {} };
    const prisma: any = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'student-1',
          revoked: false,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-1',
          role: Role.STUDENT,
          status: AccountStatus.ACTIVE,
          ...overrides,
        }),
      },
    };
    const config: any = { get: () => ({ accessSecret: secret }) };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return {
      guard: new OptionalStudentAuthGuard(config, prisma),
      request,
      prisma,
      context,
    };
  }

  function token(sub = 'student-1', sid = 'session-1') {
    return jwt.sign({ typ: 'user_access', sub, sid }, secret);
  }

  it('allows an anonymous catalog request', async () => {
    const { guard, context } = setup();
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('hydrates a valid student session', async () => {
    const { guard, request, context } = setup();
    request.headers.authorization = `Bearer ${token()}`;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'student-1',
      role: Role.STUDENT,
      sessionId: 'session-1',
    });
  });

  it('rejects a token whose session belongs to another user', async () => {
    const { guard, request, prisma, context } = setup();
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'other-user',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    request.headers.authorization = `Bearer ${token()}`;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('does not accept an administrator as an optional student', async () => {
    const { guard, request, context } = setup({ role: Role.ADMIN });
    request.headers.authorization = `Bearer ${token()}`;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
