import { ConflictException } from '@nestjs/common';
import { QuestionStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { QuestionBanksService } from './question-banks.service';

describe('QuestionBanksService.deleteQuestion', () => {
  const admin: RequestUser = {
    id: 'admin-1',
    role: Role.ADMIN,
    sessionId: 'session-1',
  };

  function buildService(status: QuestionStatus) {
    const prisma = {
      question: { delete: jest.fn().mockResolvedValue(undefined) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new QuestionBanksService(prisma as any, audit as any);
    (service as any).question = jest.fn().mockResolvedValue({
      status,
      options: [{ id: 'option-1' }],
      assets: [{ id: 'attachment-1' }],
      videoLink: { id: 'video-link-1' },
    });
    return { service, prisma, audit };
  }

  it.each([QuestionStatus.DRAFT, QuestionStatus.ARCHIVED])(
    'deletes a %s question and relies on its database cascades for children',
    async (status) => {
      const { service, prisma, audit } = buildService(status);

      await expect(
        service.deleteQuestion(admin, 'question-1'),
      ).resolves.toEqual({
        id: 'question-1',
        deleted: true,
      });

      expect(prisma.question.delete).toHaveBeenCalledWith({
        where: { id: 'question-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'QUESTION_DELETED',
          targetId: 'question-1',
        }),
      );
    },
  );

  it.each([
    QuestionStatus.REJECTED,
    QuestionStatus.IN_REVIEW,
    QuestionStatus.PUBLISHED,
  ])('refuses to delete a %s question', async (status) => {
    const { service, prisma } = buildService(status);

    await expect(service.deleteQuestion(admin, 'question-1')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.question.delete).not.toHaveBeenCalled();
  });
});
