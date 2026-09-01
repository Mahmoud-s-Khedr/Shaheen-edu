import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  AssetStatus,
  QuestionAiExplanationRunMode,
  QuestionAiExplanationRunStatus,
  QuestionAnswerOrigin,
  QuestionExplanationOrigin,
  QuestionStatus,
  QuestionType,
  Role,
} from '../../common/types/roles.enum';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BunnyStorageProvider } from '../assets/bunny-storage.provider';
import {
  ApplyAiQuestionExplanationRunDto,
  CreateAiQuestionExplanationRunDto,
  RejectAiQuestionExplanationRunDto,
} from './dto/question-ai-explanation.dto';
import {
  QuestionAiExplanationClient,
  type StructuredExplanationOutput,
} from './question-ai-explanation.client';

@Injectable()
export class QuestionAiExplanationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: BunnyStorageProvider,
    private readonly client: QuestionAiExplanationClient,
  ) {}

  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private async question(id: string) {
    const value = await this.prisma.question.findUnique({
      where: { id },
      include: {
        contentBlocks: {
          include: { asset: true },
          orderBy: { sortOrder: 'asc' },
        },
        options: {
          include: {
            contentBlocks: {
              include: { asset: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        contexts: {
          include: {
            context: {
              include: {
                contentBlocks: {
                  include: { asset: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        placements: { orderBy: { createdAt: 'asc' } },
        assets: { orderBy: { sortOrder: 'asc' } },
        videoLink: true,
        structuredExplanation: true,
      },
    });
    if (!value) throw new NotFoundException('Question not found');
    return value;
  }
  private answerFromQuestion(question: any) {
    if (
      question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.MULTIPLE_CHOICE
    )
      return {
        selectedOptionIndexes: question.options
          .map((x: any, index: number) => (x.isCorrect ? index : -1))
          .filter((index: number) => index >= 0),
        acceptedAnswers: null,
        gradingRubric: null,
      };
    if (question.type === QuestionType.LONG_ANSWER)
      return {
        selectedOptionIndexes: null,
        acceptedAnswers: null,
        gradingRubric: question.gradingRubric ?? null,
      };
    return {
      selectedOptionIndexes: null,
      acceptedAnswers: Array.isArray(question.acceptedAnswers)
        ? question.acceptedAnswers
        : [],
      gradingRubric: null,
    };
  }
  private validAnswer(type: QuestionType, value: any) {
    if (!value || typeof value !== 'object')
      throw new BadRequestException('A type-valid answer is required');
    if (
      type === QuestionType.SINGLE_CHOICE ||
      type === QuestionType.MULTIPLE_CHOICE
    ) {
      if (
        !Array.isArray(value.selectedOptionIndexes) ||
        !value.selectedOptionIndexes.length ||
        value.acceptedAnswers ||
        value.gradingRubric
      )
        throw new BadRequestException(
          'Choice questions require selectedOptionIndexes only',
        );
      return {
        selectedOptionIndexes: [
          ...new Set(value.selectedOptionIndexes as number[]),
        ].sort((a, b) => a - b),
        acceptedAnswers: null,
        gradingRubric: null,
      };
    }
    if (type === QuestionType.LONG_ANSWER) {
      if (
        typeof value.gradingRubric !== 'string' ||
        !value.gradingRubric.trim() ||
        value.selectedOptionIndexes ||
        value.acceptedAnswers
      )
        throw new BadRequestException(
          'Long-answer questions require gradingRubric only',
        );
      return {
        selectedOptionIndexes: null,
        acceptedAnswers: null,
        gradingRubric: value.gradingRubric.trim(),
      };
    }
    if (
      !Array.isArray(value.acceptedAnswers) ||
      !value.acceptedAnswers.length ||
      value.selectedOptionIndexes ||
      value.gradingRubric
    )
      throw new BadRequestException(
        'Written questions require acceptedAnswers only',
      );
    return {
      selectedOptionIndexes: null,
      acceptedAnswers: [
        ...new Set(
          value.acceptedAnswers.map((x: string) => x.trim()).filter(Boolean),
        ),
      ],
      gradingRubric: null,
    };
  }
  private sameAnswer(left: any, right: any) {
    return (
      JSON.stringify(this.normalAnswer(left)) ===
      JSON.stringify(this.normalAnswer(right))
    );
  }
  private normalAnswer(value: any) {
    return {
      selectedOptionIndexes: value?.selectedOptionIndexes
        ? [...value.selectedOptionIndexes].sort((a: number, b: number) => a - b)
        : null,
      acceptedAnswers: value?.acceptedAnswers
        ? [...value.acceptedAnswers].map(String).sort()
        : null,
      gradingRubric: value?.gradingRubric?.trim?.() ?? null,
    };
  }
  private render(explanation: StructuredExplanationOutput) {
    return [
      explanation.keywords,
      explanation.eliminationStrategy,
      explanation.whyCorrect,
      explanation.generalRule,
      explanation.whatIf,
      explanation.commonMistakes,
    ]
      .map((x) => x.trim())
      .join('\n\n');
  }
  private language(question: any) {
    const text = [
      question.body,
      ...(question.options ?? []).map((x: any) => x.body),
      ...(question.contentBlocks ?? []).flatMap((x: any) => [
        x.text,
        x.caption,
        x.altText,
      ]),
      ...(question.contexts ?? []).flatMap((x: any) => [
        x.title,
        x.body,
        ...(x.contentBlocks ?? []).flatMap((b: any) => [
          b.text,
          b.caption,
          b.altText,
        ]),
      ]),
    ]
      .filter(Boolean)
      .join(' ');
    const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
    const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
    return latin > arabic ? 'en' : 'ar';
  }
  private snapshot(question: any) {
    return {
      type: question.type,
      body: question.body,
      acceptedAnswers: question.acceptedAnswers,
      gradingRubric: question.gradingRubric,
      options: question.options.map((x: any) => ({
        body: x.body,
        isCorrect: x.isCorrect,
        contentBlocks: x.contentBlocks.map((b: any) => this.block(b)),
      })),
      contentBlocks: question.contentBlocks.map((x: any) => this.block(x)),
      contexts: question.contexts.map((x: any) => ({
        title: x.context.title,
        body: x.context.body,
        languageCode: x.context.languageCode,
        contentBlocks: x.context.contentBlocks.map((b: any) => this.block(b)),
      })),
    };
  }
  private block(block: any) {
    return {
      type: block.type,
      text: block.text,
      tableData: block.tableData,
      latex: block.latex,
      mathml: block.mathml,
      caption: block.caption,
      altText: block.altText,
      languageCode: block.languageCode,
      asset: block.asset
        ? { mimeType: block.asset.mimeType, name: block.asset.originalName }
        : null,
    };
  }
  private fingerprint(snapshot: unknown) {
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }
  private async images(question: any) {
    const blocks = [
      ...question.contentBlocks,
      ...question.options.flatMap((x: any) => x.contentBlocks),
      ...question.contexts.flatMap((x: any) => x.context.contentBlocks),
    ]
      .filter(
        (x: any) =>
          x.asset?.status === AssetStatus.READY &&
          /^image\//.test(x.asset.mimeType),
      )
      .slice(0, 8);
    return Promise.all(
      blocks.map(async (block: any) => ({
        mimeType: block.asset.mimeType,
        data: await this.storage.download(block.asset.storageKey),
      })),
    );
  }
  private validateExplanation(value: any): StructuredExplanationOutput {
    const fields = [
      'keywords',
      'eliminationStrategy',
      'whyCorrect',
      'generalRule',
      'whatIf',
      'commonMistakes',
    ] as const;
    if (
      !value ||
      !fields.every(
        (field) =>
          typeof value[field] === 'string' &&
          value[field].trim() &&
          value[field].length <= 10000,
      )
    )
      throw new BadRequestException(
        'AI returned an incomplete structured explanation',
      );
    return Object.fromEntries(
      fields.map((field) => [field, value[field].trim()]),
    ) as StructuredExplanationOutput;
  }

  async create(
    actor: RequestUser,
    questionId: string,
    dto: CreateAiQuestionExplanationRunDto,
  ) {
    this.admin(actor);
    const question = await this.question(questionId);
    if (question.status === QuestionStatus.ARCHIVED)
      throw new ConflictException('Archived questions cannot be re-answered');
    const suppliedAnswer =
      dto.mode === QuestionAiExplanationRunMode.GROUNDED
        ? this.validAnswer(question.type, dto.suppliedAnswer)
        : null;
    if (dto.mode === QuestionAiExplanationRunMode.INFER && dto.suppliedAnswer)
      throw new BadRequestException(
        'INFER requests cannot include suppliedAnswer',
      );
    const snapshot = this.snapshot(question);
    const sourceFingerprint = this.fingerprint(snapshot);
    const languageCode = this.language(snapshot);
    try {
      const response = await this.client.generate({
        mode: dto.mode,
        languageCode,
        question: snapshot,
        suppliedAnswer: suppliedAnswer ?? undefined,
        additionalContext: dto.additionalContext?.trim(),
        images: await this.images(question),
      });
      const explanation = this.validateExplanation(
        response.result.structuredExplanation,
      );
      const inferred = this.validAnswer(question.type, response.result.answer);
      const conflictWarning =
        dto.mode === QuestionAiExplanationRunMode.GROUNDED &&
        !this.sameAnswer(suppliedAnswer, inferred)
          ? response.result.conflictWarning?.trim() ||
            'The AI reasoning differs from the supplied authoritative answer.'
          : response.result.conflictWarning?.trim() || null;
      const run = await this.prisma.questionAiExplanationRun.create({
        data: {
          questionId,
          mode: dto.mode,
          questionSnapshot: snapshot as any,
          sourceFingerprint,
          languageCode,
          suppliedAnswer: suppliedAnswer as any,
          additionalContext: dto.additionalContext?.trim() || null,
          proposedAnswer: (dto.mode === QuestionAiExplanationRunMode.GROUNDED
            ? suppliedAnswer
            : inferred) as any,
          structuredExplanation: explanation as any,
          confidence: response.result.confidence,
          warnings: response.result.warnings as any,
          conflictWarning,
          model: response.model,
          promptVersion: 'question-reanswer-explanation-v1',
          rawResponse: response.raw,
          usage: response.usage,
          createdById: actor.id,
        },
      });
      await this.audit.record({
        actorUserId: actor.id,
        action: 'AI_QUESTION_REANSWER_CREATED',
        targetType: 'QuestionAiExplanationRun',
        targetId: run.id,
        metadata: { questionId, mode: dto.mode },
      });
      return run;
    } catch (error) {
      await this.prisma.questionAiExplanationRun.create({
        data: {
          questionId,
          mode: dto.mode,
          status: QuestionAiExplanationRunStatus.FAILED,
          questionSnapshot: snapshot as any,
          sourceFingerprint,
          languageCode,
          suppliedAnswer: suppliedAnswer as any,
          additionalContext: dto.additionalContext?.trim() || null,
          model: 'unavailable',
          promptVersion: 'question-reanswer-explanation-v1',
          createdById: actor.id,
          reviewNote:
            error instanceof Error ? error.message : 'AI request failed',
        },
      });
      throw error;
    }
  }
  async list(actor: RequestUser, questionId: string) {
    this.admin(actor);
    await this.question(questionId);
    return this.prisma.questionAiExplanationRun.findMany({
      where: { questionId },
      orderBy: { createdAt: 'desc' },
    });
  }
  async get(actor: RequestUser, questionId: string, runId: string) {
    this.admin(actor);
    const run = await this.prisma.questionAiExplanationRun.findFirst({
      where: { id: runId, questionId },
    });
    if (!run) throw new NotFoundException('AI re-answer run not found');
    return run;
  }
  async reject(
    actor: RequestUser,
    questionId: string,
    runId: string,
    dto: RejectAiQuestionExplanationRunDto,
  ) {
    this.admin(actor);
    const run = await this.get(actor, questionId, runId);
    if (run.status !== QuestionAiExplanationRunStatus.PENDING_REVIEW)
      throw new ConflictException('Only pending runs can be rejected');
    const result = await this.prisma.questionAiExplanationRun.update({
      where: { id: run.id },
      data: {
        status: QuestionAiExplanationRunStatus.REJECTED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: dto.note.trim(),
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'AI_QUESTION_REANSWER_REJECTED',
      targetType: 'QuestionAiExplanationRun',
      targetId: run.id,
    });
    return result;
  }

  async apply(
    actor: RequestUser,
    questionId: string,
    runId: string,
    dto: ApplyAiQuestionExplanationRunDto,
  ) {
    this.admin(actor);
    if (!dto.applyAnswer && !dto.applyExplanation)
      throw new BadRequestException(
        'Select an answer and/or explanation to apply',
      );
    const [run, source] = await Promise.all([
      this.get(actor, questionId, runId),
      this.question(questionId),
    ]);
    if (run.status !== QuestionAiExplanationRunStatus.PENDING_REVIEW)
      throw new ConflictException('Only pending runs can be applied');
    if (
      source.status !== QuestionStatus.DRAFT &&
      source.status !== QuestionStatus.REJECTED &&
      source.status !== QuestionStatus.PUBLISHED
    )
      throw new ConflictException(
        'Only draft, rejected, or published questions can receive an AI re-answer result',
      );
    const currentFingerprint = this.fingerprint(this.snapshot(source));
    if (run.sourceFingerprint !== currentFingerprint)
      throw new ConflictException(
        'Question changed after this AI run; generate a new run',
      );
    const answer = this.validAnswer(source.type, run.proposedAnswer);
    if (
      dto.applyExplanation &&
      !dto.applyAnswer &&
      !this.sameAnswer(answer, this.answerFromQuestion(source))
    )
      throw new ConflictException(
        'An explanation can be applied alone only when its answer matches the question',
      );
    const explanation = dto.applyExplanation
      ? this.validateExplanation(run.structuredExplanation)
      : null;
    const target = await this.prisma.$transaction(async (tx: any) => {
      let targetQuestion: any = source;
      if (source.status === QuestionStatus.PUBLISHED)
        targetQuestion = await tx.question.create({
          data: {
            bankId: source.bankId,
            sourceId: source.sourceId,
            courseId: source.courseId,
            type: source.type,
            body: source.body,
            explanation: source.explanation,
            maxPoints: source.maxPoints,
            acceptedAnswers: source.acceptedAnswers,
            gradingRubric: source.gradingRubric,
            answerOrigin: source.answerOrigin,
            status: QuestionStatus.DRAFT,
            createdById: actor.id,
            updatedById: actor.id,
            replacesQuestionId: source.id,
            contentBlocks: {
              create: source.contentBlocks.map((x: any) => ({
                type: x.type,
                sortOrder: x.sortOrder,
                text: x.text,
                assetId: x.assetId,
                tableData: x.tableData,
                latex: x.latex,
                mathml: x.mathml,
                caption: x.caption,
                altText: x.altText,
                languageCode: x.languageCode,
              })),
            },
            options: {
              create: source.options.map((x: any) => ({
                body: x.body,
                isCorrect: x.isCorrect,
                sortOrder: x.sortOrder,
                contentBlocks: {
                  create: x.contentBlocks.map((b: any) => ({
                    type: b.type,
                    sortOrder: b.sortOrder,
                    text: b.text,
                    assetId: b.assetId,
                    tableData: b.tableData,
                    latex: b.latex,
                    mathml: b.mathml,
                    caption: b.caption,
                    altText: b.altText,
                    languageCode: b.languageCode,
                  })),
                },
              })),
            },
            placements: {
              create: source.placements.map((x: any) => ({
                courseId: x.courseId,
                chapterId: x.chapterId,
                lessonId: x.lessonId,
                sectionId: x.sectionId,
              })),
            },
            contexts: {
              create: source.contexts.map((x: any) => ({
                contextId: x.contextId,
                sortOrder: x.sortOrder,
              })),
            },
            assets: {
              create: source.assets.map((x: any) => ({
                assetId: x.assetId,
                sortOrder: x.sortOrder,
              })),
            },
            videoLink: source.videoLink
              ? {
                  create: {
                    videoAssetId: source.videoLink.videoAssetId,
                    timestampSeconds: source.videoLink.timestampSeconds,
                  },
                }
              : undefined,
          },
        });
      if (dto.applyAnswer) {
        if (
          targetQuestion.type === QuestionType.SINGLE_CHOICE ||
          targetQuestion.type === QuestionType.MULTIPLE_CHOICE
        ) {
          await tx.questionOption.updateMany({
            where: { questionId: targetQuestion.id },
            data: { isCorrect: false },
          });
          const options = await tx.questionOption.findMany({
            where: { questionId: targetQuestion.id },
            orderBy: { sortOrder: 'asc' },
          });
          await tx.questionOption.updateMany({
            where: {
              id: {
                in: (answer.selectedOptionIndexes ?? [])
                  .map((index: number) => options[index]?.id)
                  .filter(Boolean),
              },
            },
            data: { isCorrect: true },
          });
          await tx.question.update({
            where: { id: targetQuestion.id },
            data: {
              answerOrigin: 'HUMAN_REVIEWED',
              answerReviewedAt: new Date(),
              answerReviewedById: actor.id,
              updatedById: actor.id,
            },
          });
        } else
          await tx.question.update({
            where: { id: targetQuestion.id },
            data: {
              acceptedAnswers: answer.acceptedAnswers as any,
              gradingRubric: answer.gradingRubric,
              answerOrigin: 'HUMAN_REVIEWED',
              answerReviewedAt: new Date(),
              answerReviewedById: actor.id,
              updatedById: actor.id,
            },
          });
      }
      if (dto.applyExplanation) {
        await tx.question.update({
          where: { id: targetQuestion.id },
          data: {
            explanation: this.render(explanation!),
            updatedById: actor.id,
            structuredExplanation: {
              upsert: {
                create: {
                  ...explanation!,
                  languageCode: run.languageCode,
                  origin: QuestionExplanationOrigin.AI,
                  model: run.model,
                  confidence: run.confidence,
                  answerOrigin:
                    run.mode === QuestionAiExplanationRunMode.INFER
                      ? QuestionAnswerOrigin.INFERRED
                      : QuestionAnswerOrigin.EXPLICIT,
                  warnings: run.warnings as any,
                  sourceFingerprint: dto.applyAnswer
                    ? null
                    : run.sourceFingerprint,
                  reviewedAt: new Date(),
                  reviewedById: actor.id,
                },
                update: {
                  ...explanation!,
                  languageCode: run.languageCode,
                  origin: QuestionExplanationOrigin.AI,
                  model: run.model,
                  confidence: run.confidence,
                  answerOrigin:
                    run.mode === QuestionAiExplanationRunMode.INFER
                      ? QuestionAnswerOrigin.INFERRED
                      : QuestionAnswerOrigin.EXPLICIT,
                  warnings: run.warnings as any,
                  sourceFingerprint: dto.applyAnswer
                    ? null
                    : run.sourceFingerprint,
                  staleAt: null,
                  reviewedAt: new Date(),
                  reviewedById: actor.id,
                },
              },
            },
          },
        });
      } else if (dto.applyAnswer) {
        await tx.questionExplanation.deleteMany({
          where: { questionId: targetQuestion.id },
        });
        await tx.question.update({
          where: { id: targetQuestion.id },
          data: { explanation: null, updatedById: actor.id },
        });
      }
      await tx.questionAiExplanationRun.update({
        where: { id: run.id },
        data: {
          status: QuestionAiExplanationRunStatus.APPLIED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          applyAnswer: dto.applyAnswer,
          applyExplanation: dto.applyExplanation,
          appliedQuestionId: targetQuestion.id,
          reviewNote: dto.note?.trim() || null,
        },
      });
      return targetQuestion;
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'AI_QUESTION_REANSWER_APPLIED',
      targetType: 'QuestionAiExplanationRun',
      targetId: run.id,
      metadata: {
        questionId,
        appliedQuestionId: target.id,
        applyAnswer: dto.applyAnswer,
        applyExplanation: dto.applyExplanation,
      },
    });
    return target;
  }
}
