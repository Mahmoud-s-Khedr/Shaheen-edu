import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ParentSelectedChildGuard } from './parent-selected-child.guard';
import { AccountStatus, Role } from '../types/roles.enum';

function context(request: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('ParentSelectedChildGuard', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const guard = new ParentSelectedChildGuard(prisma as any);

  beforeEach(() => jest.resetAllMocks());

  it('requires a selected child', async () => {
    await expect(
      guard.canActivate(
        context({ parentSession: { id: 'parent-1', activeStudentId: null } }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [null],
    [{ role: Role.ADMIN, status: AccountStatus.ACTIVE }],
    [{ role: Role.STUDENT, status: AccountStatus.SUSPENDED }],
    [{ role: Role.STUDENT, status: AccountStatus.DISABLED }],
  ])('rejects unavailable selected children', async (student) => {
    prisma.user.findUnique.mockResolvedValue(student);
    await expect(
      guard.canActivate(
        context({
          parentSession: { id: 'parent-1', activeStudentId: 'student-1' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an active student', async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: Role.STUDENT,
      status: AccountStatus.ACTIVE,
    });
    await expect(
      guard.canActivate(
        context({
          parentSession: { id: 'parent-1', activeStudentId: 'student-1' },
        }),
      ),
    ).resolves.toBe(true);
  });
});
