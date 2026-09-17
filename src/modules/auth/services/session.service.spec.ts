import { AppException } from '../../../common/exceptions/app.exception';
import { Role } from '../../../common/types/roles.enum';
import { SessionService } from './session.service';

describe('SessionService student device slot', () => {
  function build(active: { id: string } | null = null) {
    const tx: any = {
      $executeRaw: jest.fn(),
      authSession: {
        findFirst: jest.fn().mockResolvedValue(active),
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback: any) => callback(tx)),
      authSession: {
        create: jest.fn().mockResolvedValue({ id: 'admin-session' }),
      },
    };
    const token: any = {
      generateOpaqueRefreshToken: jest.fn().mockReturnValue('raw-token'),
      hashOpaqueToken: jest.fn().mockReturnValue('token-hash'),
      refreshTtlSeconds: 3600,
      signUserAccessToken: jest.fn().mockReturnValue('access-token'),
    };
    return { service: new SessionService(prisma, token), prisma, tx };
  }

  it('checks and creates a student session under a per-student transaction lock', async () => {
    const { service, prisma, tx } = build();
    await expect(
      service.createSession({ userId: 'student-1', role: Role.STUDENT }),
    ).resolves.toMatchObject({
      refreshToken: 'raw-token',
      accessToken: 'access-token',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'student-1', revoked: false }),
      }),
    );
    expect(tx.authSession.create).toHaveBeenCalled();
  });

  it('rejects a simultaneous-login contender after the first transaction owns the slot', async () => {
    const { service } = build({ id: 'already-active' });
    await expect(
      service.createSession({ userId: 'student-1', role: Role.STUDENT }),
    ).rejects.toMatchObject<AppException>({
      code: 'STUDENT_DEVICE_ALREADY_ACTIVE',
    });
  });

  it('does not restrict non-student sessions', async () => {
    const { service, prisma } = build({ id: 'student-session' });
    await service.createSession({ userId: 'admin-1', role: Role.ADMIN });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.authSession.create).toHaveBeenCalled();
  });
});
