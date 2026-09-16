import { QuestionStatus, Role } from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { createRequestValidationPipe } from '../../common/validation/request-validation.pipe';
import { QueryQuestionContextDto } from './dto/question-banks.dto';
import { QuestionBanksService } from './question-banks.service';

describe('QuestionBanksService listContexts', () => {
  const admin: RequestUser = {
    id: 'admin-1',
    role: Role.ADMIN,
    sessionId: 'session-1',
  };

  function buildService() {
    const prisma = {
      questionContext: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return {
      service: new QuestionBanksService(prisma as any, {} as any),
      prisma,
    };
  }

  it('accepts arcived=true from the query string', async () => {
    const result = await createRequestValidationPipe().transform(
      { page: '1', limit: '20', arcived: 'true' },
      { type: 'query', metatype: QueryQuestionContextDto },
    );

    expect(result).toEqual(
      expect.objectContaining({ page: 1, limit: 20, arcived: true }),
    );
  });

  it('hides contexts that are only linked to archived questions by default', async () => {
    const { service, prisma } = buildService();

    await service.listContexts(admin, {} as any);

    expect(prisma.questionContext.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { questions: { none: {} } },
            {
              questions: {
                some: {
                  question: { status: { not: QuestionStatus.ARCHIVED } },
                },
              },
            },
          ],
        },
      }),
    );
  });

  it('includes archived-only contexts when arcived is requested', async () => {
    const { service, prisma } = buildService();

    await service.listContexts(admin, { arcived: true } as any);

    expect(prisma.questionContext.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });
});
