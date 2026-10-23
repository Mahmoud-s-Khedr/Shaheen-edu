import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FormQuestionType,
  FormRespondentType,
  FormStatus,
  Prisma,
} from '@prisma/client';
import { assertSuperAdmin } from '../../common/authorization/admin-authorization';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateFormDto,
  FormQuestionInputDto,
  FormResultsQueryDto,
  QueryFormsDto,
  QueryFormSubmissionsDto,
  SubmitFormDto,
  UpdateFormDto,
} from './forms.dto';

const formInclude = {
  questions: {
    orderBy: { sortOrder: 'asc' },
    include: { options: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.FormInclude;
type FormDetail = Prisma.FormGetPayload<{ include: typeof formInclude }>;

const answerInclude = {
  answers: {
    orderBy: { question: { sortOrder: 'asc' } },
    include: {
      selections: {
        select: { optionId: true },
        orderBy: { option: { sortOrder: 'asc' } },
      },
    },
  },
} satisfies Prisma.FormSubmissionInclude;

export type FormRespondent =
  | { type: 'STUDENT'; studentUserId: string }
  | { type: 'PARENT'; parentPhoneNormalized: string };

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Exclusive lifecycle locks and shared submission locks use the same stable key.
  // Submissions may run concurrently; activation/close/edit cannot race with them.
  private async lock(tx: Prisma.TransactionClient, shared = false) {
    if (shared)
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(63421, 1)::text`;
    else await tx.$queryRaw`SELECT pg_advisory_xact_lock(63421, 1)::text`;
  }

  private async getForm(client: Prisma.TransactionClient, id: string) {
    const form = await client.form.findUnique({
      where: { id },
      include: formInclude,
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  private assertDraft(form: FormDetail) {
    if (form.status !== FormStatus.DRAFT)
      throw new ConflictException(
        'Only draft forms can be edited, deleted, or activated',
      );
  }

  private identity(respondent: FormRespondent) {
    return respondent.type === 'STUDENT'
      ? {
          respondentType: FormRespondentType.STUDENT,
          studentUserId: respondent.studentUserId,
        }
      : {
          respondentType: FormRespondentType.PARENT,
          parentPhoneNormalized: respondent.parentPhoneNormalized,
        };
  }

  private validateQuestions(
    questions: FormQuestionInputDto[],
    existing?: FormDetail,
  ) {
    const questionIds = new Set<string>();
    const optionIds = new Set<string>();
    for (const question of questions) {
      const old = question.id
        ? existing?.questions.find((q) => q.id === question.id)
        : undefined;
      if (question.id && (!old || questionIds.has(question.id)))
        throw new BadRequestException(
          'Question IDs must be unique and belong to this draft',
        );
      if (question.id) questionIds.add(question.id);
      const options = question.options ?? [];
      if (
        question.type === FormQuestionType.TEXT
          ? options.length > 0
          : options.length < 2
      ) {
        throw new BadRequestException(
          'Text questions cannot have options; choice questions require at least two options',
        );
      }
      for (const option of options) {
        if (
          option.id &&
          (!old?.options.some((o) => o.id === option.id) ||
            optionIds.has(option.id))
        ) {
          throw new BadRequestException(
            'Option IDs must be unique and belong to their question',
          );
        }
        if (option.id) optionIds.add(option.id);
      }
    }
  }

  private questionData(questions: FormQuestionInputDto[]) {
    return questions.map((question, index) => ({
      ...(question.id ? { id: question.id } : {}),
      title: question.title,
      type: question.type,
      required: question.required,
      sortOrder: index + 1,
      options: {
        create: (question.options ?? []).map((option, optionIndex) => ({
          ...(option.id ? { id: option.id } : {}),
          label: option.label,
          sortOrder: optionIndex + 1,
        })),
      },
    }));
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: RequestUser,
    id: string,
    action: string,
  ) {
    return this.audit.recordWithClient(tx, {
      actorUserId: actor.id,
      action,
      targetType: 'Form',
      targetId: id,
    });
  }

  async create(actor: RequestUser, dto: CreateFormDto) {
    assertSuperAdmin(actor);
    this.validateQuestions(dto.questions);
    return this.prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          title: dto.title,
          description: dto.description,
          confirmationMessage: dto.confirmationMessage,
          createdById: actor.id,
          updatedById: actor.id,
          questions: { create: this.questionData(dto.questions) },
        },
        include: formInclude,
      });
      await this.record(tx, actor, form.id, 'FORM_CREATED');
      return form;
    });
  }

  async list(actor: RequestUser, query: QueryFormsDto) {
    assertSuperAdmin(actor);
    const where = { status: query.status };
    const [forms, total] = await this.prisma.$transaction([
      this.prisma.form.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { submissions: true } } },
      }),
      this.prisma.form.count({ where }),
    ]);
    return {
      data: forms.map(({ _count, ...form }) => ({
        ...form,
        submissionCount: _count.submissions,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async get(actor: RequestUser, id: string) {
    assertSuperAdmin(actor);
    return this.getForm(this.prisma, id);
  }

  async update(actor: RequestUser, id: string, dto: UpdateFormDto) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const form = await this.getForm(tx, id);
      this.assertDraft(form);
      if (dto.questions !== undefined) {
        this.validateQuestions(dto.questions, form);
        await tx.formQuestion.deleteMany({ where: { formId: id } });
      }
      const updated = await tx.form.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          confirmationMessage: dto.confirmationMessage,
          updatedById: actor.id,
          ...(dto.questions !== undefined
            ? { questions: { create: this.questionData(dto.questions) } }
            : {}),
        },
        include: formInclude,
      });
      await this.record(tx, actor, id, 'FORM_UPDATED');
      return updated;
    });
  }

  async delete(actor: RequestUser, id: string) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      this.assertDraft(await this.getForm(tx, id));
      await tx.form.delete({ where: { id } });
      await this.record(tx, actor, id, 'FORM_DELETED');
      return { id, deleted: true };
    });
  }

  async activate(actor: RequestUser, id: string) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const form = await this.getForm(tx, id);
      if (form.status === FormStatus.ACTIVE) return form;
      this.assertDraft(form);
      const now = new Date();
      const previous = await tx.form.findFirst({
        where: { status: FormStatus.ACTIVE },
      });
      if (previous) {
        await tx.form.update({
          where: { id: previous.id },
          data: {
            status: FormStatus.CLOSED,
            closedAt: now,
            updatedById: actor.id,
          },
        });
        await this.record(tx, actor, previous.id, 'FORM_CLOSED');
      }
      const activated = await tx.form.update({
        where: { id },
        data: {
          status: FormStatus.ACTIVE,
          activatedAt: now,
          updatedById: actor.id,
        },
        include: formInclude,
      });
      await this.record(tx, actor, id, 'FORM_ACTIVATED');
      return activated;
    });
  }

  async close(actor: RequestUser, id: string) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const form = await this.getForm(tx, id);
      if (form.status === FormStatus.CLOSED) return form;
      if (form.status !== FormStatus.ACTIVE)
        throw new ConflictException('Only active forms can be closed');
      const closed = await tx.form.update({
        where: { id },
        data: {
          status: FormStatus.CLOSED,
          closedAt: new Date(),
          updatedById: actor.id,
        },
        include: formInclude,
      });
      await this.record(tx, actor, id, 'FORM_CLOSED');
      return closed;
    });
  }

  async active(respondent: FormRespondent) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, true);
      const form = await tx.form.findFirst({
        where: { status: FormStatus.ACTIVE },
        include: formInclude,
      });
      if (!form) return { form: null, hasSubmitted: false, submissionId: null };
      const submission = await tx.formSubmission.findFirst({
        where: { formId: form.id, ...this.identity(respondent) },
        select: { id: true },
      });
      // Respondents receive only form content, never staff identifiers or other responses.
      const { id, title, description, confirmationMessage, questions } = form;
      return {
        form: { id, title, description, confirmationMessage, questions },
        hasSubmitted: !!submission,
        submissionId: submission?.id ?? null,
      };
    });
  }

  private validateAnswers(form: FormDetail, dto: SubmitFormDto) {
    const seen = new Set<string>();
    for (const answer of dto.answers) {
      const question = form.questions.find((q) => q.id === answer.questionId);
      if (!question || seen.has(answer.questionId))
        throw new BadRequestException(
          'Answers must reference distinct questions belonging to this form',
        );
      seen.add(answer.questionId);
      if (question.type === FormQuestionType.TEXT) {
        if (!answer.text?.trim() || answer.optionIds !== undefined)
          throw new BadRequestException(
            'Text questions require a nonblank text answer only',
          );
      } else {
        const ids = answer.optionIds ?? [];
        if (
          answer.text !== undefined ||
          !ids.length ||
          new Set(ids).size !== ids.length ||
          (question.type === FormQuestionType.SINGLE_CHOICE &&
            ids.length !== 1) ||
          ids.some((id) => !question.options.some((option) => option.id === id))
        ) {
          throw new BadRequestException(
            'Invalid choice answer or option does not belong to this question',
          );
        }
      }
    }
    if (
      form.questions.some(
        (question) => question.required && !seen.has(question.id),
      )
    )
      throw new BadRequestException('All required questions must be answered');
  }

  private toSubmission(
    submission: Prisma.FormSubmissionGetPayload<{
      include: typeof answerInclude;
    }>,
  ) {
    const { answers, ...summary } = submission;
    return {
      ...summary,
      answers: answers.map(({ selections, ...answer }) => ({
        ...answer,
        optionIds: selections.map((selection) => selection.optionId),
      })),
    };
  }

  async submit(respondent: FormRespondent, id: string, dto: SubmitFormDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, true);
        const form = await this.getForm(tx, id);
        if (form.status !== FormStatus.ACTIVE)
          throw new ConflictException(
            'Form is no longer accepting submissions',
          );
        this.validateAnswers(form, dto);
        const submission = await tx.formSubmission.create({
          data: {
            formId: id,
            ...this.identity(respondent),
            answers: {
              create: dto.answers.map((answer) => ({
                questionId: answer.questionId,
                text: answer.text,
                selections: {
                  create: (answer.optionIds ?? []).map((optionId) => ({
                    optionId,
                  })),
                },
              })),
            },
          },
          include: answerInclude,
        });
        return {
          ...this.toSubmission(submission),
          confirmationMessage: form.confirmationMessage,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('You have already submitted this form');
      throw error;
    }
  }

  async ownSubmission(respondent: FormRespondent, id: string) {
    const submission = await this.prisma.formSubmission.findFirst({
      where: { formId: id, ...this.identity(respondent) },
      include: answerInclude,
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return this.toSubmission(submission);
  }

  async submissions(
    actor: RequestUser,
    id: string,
    query: QueryFormSubmissionsDto,
  ) {
    assertSuperAdmin(actor);
    await this.getForm(this.prisma, id);
    const where = { formId: id, respondentType: query.respondentType };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.formSubmission.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          student: {
            select: { studentProfile: { select: { fullName: true } } },
          },
        },
      }),
      this.prisma.formSubmission.count({ where }),
    ]);
    return {
      data: data.map(({ student, ...submission }) => ({
        ...submission,
        studentName: student?.studentProfile?.fullName ?? null,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async submission(actor: RequestUser, id: string, submissionId: string) {
    assertSuperAdmin(actor);
    const submission = await this.prisma.formSubmission.findFirst({
      where: { id: submissionId, formId: id },
      include: answerInclude,
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return this.toSubmission(submission);
  }

  async results(actor: RequestUser, id: string, query: FormResultsQueryDto) {
    assertSuperAdmin(actor);
    return this.prisma.$transaction(
      async (tx) => {
        const form = await this.getForm(tx, id);
        const where = { formId: id, respondentType: query.respondentType };
        const totalSubmissions = await tx.formSubmission.count({ where });
        const counts = await tx.formAnswer.groupBy({
          by: ['questionId'],
          where: { submission: where },
          _count: { _all: true },
        });
        const selections = await tx.formAnswerSelection.groupBy({
          by: ['optionId'],
          where: { answer: { submission: where } },
          _count: { _all: true },
        });
        const answerCounts = new Map(
          counts.map((count) => [count.questionId, count._count._all]),
        );
        const selectionCounts = new Map(
          selections.map((count) => [count.optionId, count._count._all]),
        );
        return {
          formId: id,
          respondentType: query.respondentType ?? null,
          totalSubmissions,
          questions: form.questions.map((question) => {
            const answerCount = answerCounts.get(question.id) ?? 0;
            return {
              id: question.id,
              title: question.title,
              type: question.type,
              answerCount,
              options: question.options.map((option) => {
                const count = selectionCounts.get(option.id) ?? 0;
                return {
                  id: option.id,
                  label: option.label,
                  count,
                  percentage: answerCount
                    ? Math.round((count / answerCount) * 10000) / 100
                    : 0,
                };
              }),
            };
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
