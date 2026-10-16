import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionBanksService } from './question-banks.service';
import { Role } from '../../common/types/roles.enum';

function build() {
  const prisma: any = {
    question: { findUnique: jest.fn().mockResolvedValue({ id: 'question' }) },
    questionCommunityStat: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'publisher',
            loginIdentifier: 'secret',
            partnerProfile: { displayName: 'Publisher', phone: 'secret' },
          },
        ]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const service: any = Object.create(QuestionBanksService.prototype);
  service.prisma = prisma;
  return { service, prisma };
}

describe('Content staff safe queries', () => {
  it.each([Role.ADMIN, Role.SUPER_ADMIN])(
    'returns aggregate statistics and empty defaults for %s',
    async (role) => {
      const { service, prisma } = build();
      const actor = { role };
      expect(await service.questionStatistics(actor, 'question')).toEqual({
        questionId: 'question',
        totalResponses: 0,
        correctResponses: 0,
        incorrectResponses: 0,
        incorrectRate: null,
        difficultyBand: null,
        calculatedAt: null,
      });
      const stats = {
        questionId: 'question',
        totalResponses: 5,
        correctResponses: 3,
        incorrectResponses: 2,
        incorrectRate: 0.4,
        difficultyBand: 'B',
        calculatedAt: new Date(),
      };
      prisma.questionCommunityStat.findUnique.mockResolvedValue({
        ...stats,
        students: ['secret'],
      });
      expect(await service.questionStatistics(actor, 'question')).toEqual(
        stats,
      );
      prisma.question.findUnique.mockResolvedValue(null);
      await expect(
        service.questionStatistics(actor, 'unknown'),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it.each([Role.ADMIN, Role.SUPER_ADMIN])(
    'limits publisher output and filters active publishers for %s',
    async (role) => {
      const { service, prisma } = build();
      const result = await service.listPublishers(
        { role },
        { page: 2, limit: 10 },
      );
      expect(result).toEqual({
        data: [{ userId: 'publisher', displayName: 'Publisher' }],
        meta: { page: 2, limit: 10, total: 1, totalPages: 1 },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          where: {
            role: 'PARTNER',
            status: 'ACTIVE',
            deletedAt: null,
            partnerProfile: { is: { partnerType: 'CONTENT_PUBLISHER' } },
          },
          select: {
            id: true,
            partnerProfile: { select: { displayName: true } },
          },
        }),
      );
    },
  );
  it('denies non-content roles before querying', async () => {
    const { service, prisma } = build();
    await expect(
      service.questionStatistics({ role: Role.STUDENT }, 'question'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.listPublishers({ role: Role.PARTNER }, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.question.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
