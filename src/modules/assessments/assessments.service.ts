import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AssessmentAttemptStatus,
  AssessmentQuestionOutcome,
  AssetKind,
  AssessmentGenerationType,
  AssessmentMode,
  AssessmentOwnerType,
  AssessmentStatus,
  ContentStatus,
  QuestionStatus,
  QuestionDifficultyBand,
  QuestionType,
  Role,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  orderByIds,
  paginateArabicSearch,
  normalizeArabic,
  resolveSearchQuery,
  searchArabicOffsetPage,
  sqlAnd,
  type ArabicSearchScope,
} from '../../common/search/arabic-search';
import type { RequestUser } from '../../common/types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import { QuestionCommunityStatsService } from '../question-banks/question-community-stats.service';
import { AssetsService } from '../assets/assets.service';
import { VideosService } from '../videos/videos.service';
import type {
  AssessmentScopeDto,
  AssessmentAnalyticsQueryDto,
  AssessmentResultQueryDto,
  AutosaveAnswerDto,
  CreateCustomAssessmentDto,
  GenerateAdminStandardAssessmentDto,
  GenerateStudentAssessmentDto,
  QueryAdminAssessmentDto,
  QueryAssessmentDto,
  RenameAssessmentDto,
  UpdateAdminAssessmentDto,
  ReportActiveTimeDto,
} from './dto/assessments.dto';

type ScopeField = 'courseId' | 'chapterId' | 'lessonId' | 'sectionId';
type ScopeRow = {
  courseId?: string | null;
  chapterId?: string | null;
  lessonId?: string | null;
  sectionId?: string | null;
};

const scopeInclude = {
  course: { include: { subject: true } },
  chapter: { include: { course: { include: { subject: true } } } },
  lesson: {
    include: {
      chapter: { include: { course: { include: { subject: true } } } },
    },
  },
  section: {
    include: {
      lesson: {
        include: {
          chapter: { include: { course: { include: { subject: true } } } },
        },
      },
    },
  },
};

const ASSESSMENT_SEARCH_BATCH_SIZE = 500;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ContentAccessPolicyService,
    private readonly communityStats: QuestionCommunityStatsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly assets: AssetsService,
    private readonly videos: VideosService,
  ) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }

  private async studentGrade(studentId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { academicGradeId: true },
    });
    if (!profile?.academicGradeId)
      throw new ConflictException('Student academic grade is required');
    return profile.academicGradeId;
  }

  // --- Scope resolution -------------------------------------------------

  private async resolveScopes(dtos: AssessmentScopeDto[]): Promise<ScopeRow[]> {
    const seen = new Set<string>();
    const rows: ScopeRow[] = [];
    for (const dto of dtos) {
      const targets = (
        Object.entries(dto) as [ScopeField, string | undefined][]
      ).filter(([, value]) => Boolean(value));
      if (targets.length !== 1)
        throw new BadRequestException(
          'Each scope must have exactly one target',
        );
      const [field, id] = targets[0] as [ScopeField, string];
      const key = `${field}:${id}`;
      if (seen.has(key)) throw new BadRequestException('Scopes must be unique');
      seen.add(key);
      const target = await this.resolveNode(field, id);
      if (!target || target.status === ContentStatus.ARCHIVED)
        throw new NotFoundException(`Scope ${field} not found`);
      rows.push({
        courseId: null,
        chapterId: null,
        lessonId: null,
        sectionId: null,
        [field]: id,
      });
    }
    return rows;
  }

  private resolveNode(field: ScopeField, id: string) {
    if (field === 'courseId')
      return this.prisma.course.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
    if (field === 'chapterId')
      return this.prisma.chapter.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
    if (field === 'lessonId')
      return this.prisma.lesson.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
    return this.prisma.section.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
  }

  private async studentScopes(
    dto: GenerateStudentAssessmentDto,
    subjectId?: string,
  ) {
    const grouped: AssessmentScopeDto[] = [
      ...(dto.courseIds ?? []).map((courseId) => ({ courseId })),
      ...(dto.chapterIds ?? []).map((chapterId) => ({ chapterId })),
      ...(dto.lessonIds ?? []).map((lessonId) => ({ lessonId })),
      ...(dto.sectionIds ?? []).map((sectionId) => ({ sectionId })),
    ];
    if (!grouped.length)
      throw new BadRequestException(
        'Select at least one course, chapter, lesson, or section',
      );
    const scopes = await this.resolveScopes(grouped);
    for (const scope of scopes) {
      const node: any = scope.courseId
        ? await this.prisma.course.findUnique({
            where: { id: scope.courseId },
            select: { subjectId: true },
          })
        : scope.chapterId
          ? await this.prisma.chapter.findUnique({
              where: { id: scope.chapterId },
              select: { course: { select: { subjectId: true } } },
            })
          : scope.lessonId
            ? await this.prisma.lesson.findUnique({
                where: { id: scope.lessonId },
                select: {
                  chapter: {
                    select: { course: { select: { subjectId: true } } },
                  },
                },
              })
            : await this.prisma.section.findUnique({
                where: { id: scope.sectionId! },
                select: {
                  lesson: {
                    select: {
                      chapter: {
                        select: { course: { select: { subjectId: true } } },
                      },
                    },
                  },
                },
              });
      const nodeSubjectId =
        node?.subjectId ??
        node?.course?.subjectId ??
        node?.chapter?.course?.subjectId ??
        node?.lesson?.chapter?.course?.subjectId;
      if (subjectId && nodeSubjectId !== subjectId)
        throw new BadRequestException(
          'All selected scopes must belong to the question bank subject',
        );
    }
    return scopes;
  }

  private placementInScope(placement: any, scope: ScopeRow) {
    if (scope.courseId)
      return (
        placement.courseId === scope.courseId ||
        placement.chapter?.courseId === scope.courseId ||
        placement.lesson?.chapter?.courseId === scope.courseId ||
        placement.section?.lesson?.chapter?.courseId === scope.courseId
      );
    if (scope.chapterId)
      return (
        placement.chapterId === scope.chapterId ||
        placement.lesson?.chapterId === scope.chapterId ||
        placement.section?.lesson?.chapterId === scope.chapterId
      );
    if (scope.lessonId)
      return (
        placement.lessonId === scope.lessonId ||
        placement.section?.lessonId === scope.lessonId
      );
    return placement.sectionId === scope.sectionId;
  }

  private placementNodes(placement: any): any[] {
    return placement.section
      ? [
          placement.section,
          placement.section.lesson,
          placement.section.lesson.chapter,
          placement.section.lesson.chapter.course,
        ]
      : placement.lesson
        ? [
            placement.lesson,
            placement.lesson.chapter,
            placement.lesson.chapter.course,
          ]
        : placement.chapter
          ? [placement.chapter, placement.chapter.course]
          : [placement.course];
  }

  /** Every ancestor of the placement (down to its course) must be published,
   * regardless of who is generating the assessment — an admin must not be
   * able to surface a question whose only matching placement sits under a
   * draft chapter/lesson/section. */
  private placementPublished(nodes: any[]): boolean {
    return !nodes.some((node: any) => node.status !== ContentStatus.PUBLISHED);
  }

  /** `placements` must already be filtered to published-ancestry ones. */
  private async questionAccessible(studentId: string, placements: any[]) {
    for (const placement of placements)
      if (
        await this.access.entitledForNodes(
          studentId,
          this.placementNodes(placement),
        )
      )
        return true;
    return false;
  }

  private questionPlacementInclude() {
    return {
      course: true,
      chapter: { include: { course: true } },
      lesson: { include: { chapter: { include: { course: true } } } },
      section: {
        include: {
          lesson: { include: { chapter: { include: { course: true } } } },
        },
      },
    };
  }

  private scopeDto(scope: any) {
    return {
      courseId: scope.courseId,
      courseName: scope.course?.title ?? null,
      chapterId: scope.chapterId,
      chapterName: scope.chapter?.title ?? null,
      lessonId: scope.lessonId,
      lessonName: scope.lesson?.title ?? null,
      sectionId: scope.sectionId,
      sectionName: scope.section?.title ?? null,
    };
  }

  /** Published questions whose placements intersect any of the given scopes.
   * When `studentIdForEntitlement` is set, also requires the requesting student's
   * own entitlement on each matched placement and their own grade to match
   * (mirrors LearningService.practiceQuestions). Admin generation omits both. */
  private async eligibleQuestions(
    scopes: ScopeRow[],
    studentIdForEntitlement?: string,
    gradeId?: string,
    filters?: {
      bankIds?: string[];
      sourceIds?: string[];
      sourceTypes?: any[];
      difficultyBands?: QuestionDifficultyBand[];
      markedOnly?: boolean;
      questionStatuses?: string[];
    },
  ) {
    const questions = await this.prisma.question.findMany({
      where: {
        status: QuestionStatus.PUBLISHED,
        ...(filters?.bankIds?.length
          ? { bankId: { in: filters.bankIds } }
          : {}),
        ...(filters?.sourceIds?.length
          ? { sourceId: { in: filters.sourceIds } }
          : {}),
        ...(filters?.difficultyBands?.length
          ? {
              communityStats: {
                difficultyBand: { in: filters.difficultyBands },
              },
            }
          : {}),
        bank: { status: ContentStatus.PUBLISHED },
        source: {
          status: ContentStatus.PUBLISHED,
          ...(filters?.sourceTypes?.length
            ? { type: { in: filters.sourceTypes } }
            : {}),
        },
        course: {
          status: ContentStatus.PUBLISHED,
          subject: {
            status: ContentStatus.PUBLISHED,
            ...(gradeId ? { academicGradeId: gradeId } : {}),
            academicGrade: { status: ContentStatus.PUBLISHED },
          },
        },
      },
      include: {
        course: { include: { subject: true } },
        options: { orderBy: { sortOrder: 'asc' } },
        contexts: { include: { context: true }, orderBy: { sortOrder: 'asc' } },
        structuredExplanation: true,
        communityStats: true,
        videoLink: { include: { videoAsset: { include: { asset: true } } } },
        assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        placements: { include: this.questionPlacementInclude() },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    const eligible: any[] = [];
    for (const question of questions) {
      const matching = question.placements
        .filter(
          (p: any) =>
            !scopes.length || scopes.some((s) => this.placementInScope(p, s)),
        )
        .filter((p: any) => this.placementPublished(this.placementNodes(p)));
      if (!matching.length) continue;
      if (
        studentIdForEntitlement &&
        !(await this.questionAccessible(studentIdForEntitlement, matching))
      )
        continue;
      eligible.push(question);
    }
    if (
      !studentIdForEntitlement ||
      (!filters?.markedOnly && !filters?.questionStatuses?.length)
    )
      return eligible;
    const marks = filters?.markedOnly
      ? new Set(
          (
            await this.prisma.studentQuestionMark.findMany({
              where: {
                studentUserId: studentIdForEntitlement,
                questionId: { in: eligible.map((q) => q.id) },
              },
              select: { questionId: true },
            })
          ).map((x) => x.questionId),
        )
      : null;
    const status = await this.studentQuestionStatuses(
      studentIdForEntitlement,
      eligible.map((q) => q.id),
    );
    return eligible.filter((question) => {
      if (marks && !marks.has(question.id)) return false;
      const selected = (filters?.questionStatuses ?? []).filter(
        (x) => x !== 'ALL',
      );
      const current = status.get(question.id);
      return (
        !selected.length ||
        selected.includes(current ?? 'UNUSED') ||
        (selected.includes('USED') && Boolean(current))
      );
    });
  }

  private async studentQuestionStatuses(
    studentId: string,
    questionIds: string[],
  ) {
    const state = new Map<string, { status: string; at: Date }>();
    const direct = await this.prisma.studentQuestionAttempt.findMany({
      where: { studentUserId: studentId, questionId: { in: questionIds } },
      select: { questionId: true, isCorrect: true, submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    });
    for (const row of direct)
      state.set(row.questionId, {
        status: row.isCorrect ? 'CORRECT' : 'INCORRECT',
        at: row.submittedAt,
      });
    const assessment = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        attempt: {
          studentUserId: studentId,
          status: AssessmentAttemptStatus.COMPLETED,
        },
        assessmentQuestion: { sourceQuestionId: { in: questionIds } },
        outcome: { not: null },
      },
      select: {
        outcome: true,
        updatedAt: true,
        assessmentQuestion: { select: { sourceQuestionId: true } },
      },
    });
    for (const row of assessment) {
      const id = row.assessmentQuestion.sourceQuestionId;
      const old = state.get(id);
      if (!old || row.updatedAt > old.at)
        state.set(id, { status: row.outcome!, at: row.updatedAt });
    }
    return new Map([...state].map(([id, value]) => [id, value.status]));
  }

  private shuffle<T>(items: T[]): T[] {
    return [...items].sort(() => Math.random() - 0.5);
  }

  private defaultTitle(mode: AssessmentMode) {
    const label = mode === AssessmentMode.TUTOR ? 'Tutor Quiz' : 'Exam';
    return `${label} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  }

  private async freezeSnapshot(
    tx: any,
    params: {
      ownerType: AssessmentOwnerType;
      studentUserId?: string;
      createdByAdminId?: string;
      title: string;
      generationType: AssessmentGenerationType;
      mode: AssessmentMode;
      isTimed: boolean;
      durationSeconds?: number;
      status: AssessmentStatus;
      scopes: ScopeRow[];
      questions: any[];
      questionBankId?: string;
      questionBankIds?: string[];
      generationFilters?: object;
    },
  ) {
    const assessment = await tx.assessment.create({
      data: {
        ownerType: params.ownerType,
        studentUserId: params.studentUserId,
        createdByAdminId: params.createdByAdminId,
        title: params.title,
        generationType: params.generationType,
        mode: params.mode,
        isTimed: params.isTimed,
        durationSeconds: params.durationSeconds,
        questionCount: params.questions.length,
        status: params.status,
        questionBankId: params.questionBankId,
        questionBanks: params.questionBankIds?.length
          ? {
              create: params.questionBankIds.map((questionBankId) => ({
                questionBankId,
              })),
            }
          : undefined,
        generationFilters: params.generationFilters,
        publishedAt:
          params.status === AssessmentStatus.READY ? new Date() : null,
        scopes: { create: params.scopes },
      },
    });
    for (let i = 0; i < params.questions.length; i++) {
      const question = params.questions[i];
      const snapshotQuestion = await tx.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          sourceQuestionId: question.id,
          sortOrder: i + 1,
          type: question.type,
          body: question.body,
          explanation: question.explanation,
          videoAssetId: question.videoLink?.videoAssetId ?? null,
          videoAssetName: question.videoLink?.videoAsset?.asset?.filename ?? null,
          timestampSeconds: question.videoLink?.timestampSeconds ?? null,
          attachments: {
            create: (question.assets ?? []).map((attachment: any, index: number) => ({
              assetId: attachment.assetId,
              assetKind: attachment.asset.kind,
              assetName: attachment.asset.filename,
              sortOrder: index + 1,
            })),
          },
          structuredExplanation: question.structuredExplanation ? { languageCode: question.structuredExplanation.languageCode, keywords: question.structuredExplanation.keywords, eliminationStrategy: question.structuredExplanation.eliminationStrategy, whyCorrect: question.structuredExplanation.whyCorrect, generalRule: question.structuredExplanation.generalRule, whatIf: question.structuredExplanation.whatIf, commonMistakes: question.structuredExplanation.commonMistakes, origin: question.structuredExplanation.origin, confidence: question.structuredExplanation.confidence, answerOrigin: question.structuredExplanation.answerOrigin, warnings: question.structuredExplanation.warnings } : undefined,
          options: {
            create: question.options.map((option: any, index: number) => ({
              body: option.body,
              isCorrect: option.isCorrect,
              sortOrder: index + 1,
            })),
          },
          placements: {
            create: question.placements.map((placement: any) =>
              this.snapshotPlacement(question, placement),
            ),
          },
        },
      });
      for (const link of question.contexts ?? []) {
        const source = link.context;
        const context = await tx.assessmentContext.upsert({ where: { assessmentId_sourceContextId: { assessmentId: assessment.id, sourceContextId: source.id } }, create: { assessmentId: assessment.id, sourceContextId: source.id, type: source.type, title: source.title, body: source.body, languageCode: source.languageCode, sourceLocator: source.sourceLocator }, update: {} });
        await tx.assessmentQuestionContext.create({ data: { assessmentQuestionId: snapshotQuestion.id, assessmentContextId: context.id, sortOrder: link.sortOrder } });
      }
    }
    return assessment;
  }

  private snapshotPlacement(question: any, placement: any) {
    const course =
      placement.section?.lesson?.chapter?.course ??
      placement.lesson?.chapter?.course ??
      placement.chapter?.course ??
      placement.course;
    const lesson = placement.section?.lesson ?? placement.lesson ?? null;
    const chapter = lesson?.chapter ?? placement.chapter ?? null;
    const subject = question.course?.subject;
    if (!course || !subject)
      throw new BadRequestException(
        'Question placement cannot be resolved for analytics',
      );
    return {
      subjectId: subject.id,
      subjectTitle: subject.title,
      courseId: course.id,
      courseTitle: course.title,
      chapterId: chapter?.id ?? null,
      chapterTitle: chapter?.title ?? null,
      lessonId: lesson?.id ?? null,
      lessonTitle: lesson?.title ?? null,
      sectionId: placement.section?.id ?? null,
      sectionTitle: placement.section?.title ?? null,
    };
  }

  // --- Student: generation ------------------------------------------------

  async generateStandard(studentId: string, dto: GenerateStudentAssessmentDto) {
    const gradeId = await this.studentGrade(studentId);
    if (dto.isTimed && !dto.durationSeconds)
      throw new BadRequestException(
        'durationSeconds is required when isTimed is true',
      );
    const bankIds = dto.questionBankIds ?? [];
    const banks = bankIds.length
      ? await this.prisma.questionBank.findMany({
          where: {
            id: { in: bankIds },
            status: ContentStatus.PUBLISHED,
            subject: {
              status: ContentStatus.PUBLISHED,
              academicGradeId: gradeId,
              academicGrade: { status: ContentStatus.PUBLISHED },
            },
          },
          select: { id: true, subjectId: true },
        })
      : [];
    if (
      banks.length !== bankIds.length ||
      banks.some((bank) => !bank.subjectId)
    )
      throw new NotFoundException(
        'One or more question banks are not accessible',
      );
    const subjectIds = new Set(banks.map((bank) => bank.subjectId));
    if (subjectIds.size > 1)
      throw new BadRequestException(
        'All selected question banks must belong to the same subject',
      );
    const scopes = await this.studentScopes(
      dto,
      banks[0]?.subjectId ?? undefined,
    );
    const eligible = await this.eligibleQuestions(scopes, studentId, gradeId, {
      bankIds,
      sourceIds: dto.sourceIds,
      sourceTypes: dto.sourceTypes,
      difficultyBands: dto.difficultyBands,
      markedOnly: dto.markedOnly,
      questionStatuses: dto.questionStatuses,
    });
    if (eligible.length < dto.questionCount)
      throw new BadRequestException(
        'Not enough eligible questions in the selected scope',
      );
    const selected = this.shuffle(eligible).slice(0, dto.questionCount);
    const mode = dto.mode ?? AssessmentMode.EXAM;
    const assessment = await this.prisma.$transaction((tx) =>
      this.freezeSnapshot(tx, {
        ownerType: AssessmentOwnerType.STUDENT,
        studentUserId: studentId,
        title: dto.title?.trim() || this.defaultTitle(mode),
        generationType: AssessmentGenerationType.STANDARD,
        mode,
        isTimed: dto.isTimed ?? false,
        durationSeconds: dto.durationSeconds,
        status: AssessmentStatus.READY,
        questionBankIds: bankIds,
        generationFilters: {
          questionBankIds: bankIds,
          sourceIds: dto.sourceIds ?? [],
          sourceTypes: dto.sourceTypes ?? [],
          difficultyBands: dto.difficultyBands ?? [],
          questionStatuses: dto.questionStatuses ?? [],
          markedOnly: dto.markedOnly ?? false,
        },
        scopes,
        questions: selected,
      }),
    );
    return this.get(studentId, assessment.id);
  }

  async listStudentQuestionBanks(studentId: string, subjectId?: string) {
    const gradeId = await this.studentGrade(studentId);
    const questions = await this.eligibleQuestions([], studentId, gradeId);
    const counts = new Map<string, number>();
    for (const question of questions)
      counts.set(question.bankId, (counts.get(question.bankId) ?? 0) + 1);
    const banks = await this.prisma.questionBank.findMany({
      where: {
        id: { in: [...counts.keys()] },
        status: ContentStatus.PUBLISHED,
        ...(subjectId ? { subjectId } : {}),
      },
      include: { subject: { select: { id: true, title: true } } },
      orderBy: { title: 'asc' },
    });
    return {
      data: banks.map((bank) => ({
        id: bank.id,
        title: bank.title,
        subject: bank.subject,
        availableQuestionCount: counts.get(bank.id) ?? 0,
      })),
    };
  }

  async listStudentQuestionSources(studentId: string, bankId: string) {
    const gradeId = await this.studentGrade(studentId);
    const bank = await this.prisma.questionBank.findFirst({
      where: {
        id: bankId,
        status: ContentStatus.PUBLISHED,
        subject: { academicGradeId: gradeId, status: ContentStatus.PUBLISHED },
      },
    });
    if (!bank) throw new NotFoundException('Question bank is not accessible');
    const questions = await this.eligibleQuestions([], studentId, gradeId, {
      bankIds: [bankId],
    });
    const counts = new Map<string, number>();
    for (const question of questions)
      counts.set(question.sourceId, (counts.get(question.sourceId) ?? 0) + 1);
    const sources = await this.prisma.questionSource.findMany({
      where: { id: { in: [...counts.keys()] } },
      orderBy: { titleAr: 'asc' },
    });
    return {
      data: sources.map((source) => ({
        id: source.id,
        title: { ar: source.titleAr, en: source.titleEn },
        type: source.type,
        availableQuestionCount: counts.get(source.id) ?? 0,
      })),
    };
  }

  /**
   * Assessment responses expose the immutable AssessmentQuestion id, while
   * private marks belong to the authored Question row. Accept either id at
   * this boundary so a student can mark a question directly from an
   * assessment without getting a misleading "not accessible" response.
   */
  private async resolveMarkedQuestionId(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (question) return question.id;

    const assessmentQuestion = await this.prisma.assessmentQuestion.findUnique({
      where: { id: questionId },
      select: { sourceQuestionId: true },
    });
    return assessmentQuestion?.sourceQuestionId ?? null;
  }

  async markQuestion(studentId: string, questionId: string) {
    const markedQuestionId = await this.resolveMarkedQuestionId(questionId);
    if (!markedQuestionId)
      throw new NotFoundException('Question is not accessible');
    const gradeId = await this.studentGrade(studentId);
    const accessible = await this.eligibleQuestions([], studentId, gradeId);
    if (!accessible.some((question) => question.id === markedQuestionId))
      throw new NotFoundException('Question is not accessible');
    await this.prisma.studentQuestionMark.upsert({
      where: {
        studentUserId_questionId: {
          studentUserId: studentId,
          questionId: markedQuestionId,
        },
      },
      create: { studentUserId: studentId, questionId: markedQuestionId },
      update: {},
    });
    return { questionId: markedQuestionId, marked: true };
  }

  async listMarkedQuestions(studentId: string) {
    const gradeId = await this.studentGrade(studentId);
    const accessible = new Set(
      (await this.eligibleQuestions([], studentId, gradeId)).map(
        (question) => question.id,
      ),
    );
    const marks = await this.prisma.studentQuestionMark.findMany({
      where: { studentUserId: studentId },
      include: {
        question: {
          select: {
            id: true,
            bankId: true,
            sourceId: true,
            communityStats: { select: { difficultyBand: true } },
            bank: {
              select: {
                id: true,
                title: true,
                subject: { select: { id: true, title: true } },
              },
            },
            source: {
              select: { id: true, type: true, titleAr: true, titleEn: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: marks
        .filter((mark) => accessible.has(mark.questionId))
        .map((mark) => ({
          questionId: mark.questionId,
          markedAt: mark.createdAt,
          bank: mark.question.bank,
          source: {
            id: mark.question.source.id,
            type: mark.question.source.type,
            title: {
              ar: mark.question.source.titleAr,
              en: mark.question.source.titleEn,
            },
          },
          difficultyBand:
            mark.question.communityStats?.difficultyBand ??
            QuestionDifficultyBand.D,
        })),
    };
  }

  async unmarkQuestion(studentId: string, questionId: string) {
    const markedQuestionId = await this.resolveMarkedQuestionId(questionId);
    await this.prisma.studentQuestionMark.deleteMany({
      where: {
        studentUserId: studentId,
        questionId: markedQuestionId ?? questionId,
      },
    });
    return { questionId: markedQuestionId ?? questionId, marked: false };
  }

  private async accessibleSourceQuestionId(studentId: string, questionId: string) {
    const sourceQuestionId = await this.resolveMarkedQuestionId(questionId);
    if (!sourceQuestionId) throw new NotFoundException('Question is not accessible');
    const gradeId = await this.studentGrade(studentId);
    const accessible = await this.eligibleQuestions([], studentId, gradeId);
    if (!accessible.some((question) => question.id === sourceQuestionId))
      throw new NotFoundException('Question is not accessible');
    return sourceQuestionId;
  }

  async saveQuestionNote(studentId: string, questionId: string, body: string) {
    const sourceQuestionId = await this.accessibleSourceQuestionId(studentId, questionId);
    const normalizedBody = body.trim();
    if (!normalizedBody)
      throw new BadRequestException('Note must not be blank');
    const note = await this.prisma.studentQuestionNote.upsert({
      where: {
        studentUserId_questionId: { studentUserId: studentId, questionId: sourceQuestionId },
      },
      create: { studentUserId: studentId, questionId: sourceQuestionId, body: normalizedBody },
      update: { body: normalizedBody },
    });
    return { questionId: sourceQuestionId, body: note.body, createdAt: note.createdAt, updatedAt: note.updatedAt };
  }

  async deleteQuestionNote(studentId: string, questionId: string) {
    const sourceQuestionId = await this.accessibleSourceQuestionId(studentId, questionId);
    await this.prisma.studentQuestionNote.deleteMany({
      where: { studentUserId: studentId, questionId: sourceQuestionId },
    });
    return { questionId: sourceQuestionId, deleted: true };
  }

  // --- Student: list/get ----------------------------------------------

  private listItemDto(
    assessment: any,
    visibility: 'MINE' | 'PUBLIC',
    attempt?: any,
  ) {
    return {
      id: assessment.id,
      title: assessment.title,
      visibility,
      generationType: assessment.generationType,
      mode: assessment.mode,
      isTimed: assessment.isTimed,
      durationSeconds: assessment.durationSeconds,
      questionCount: assessment.questionCount,
      createdAt: assessment.createdAt,
      attemptStatus: attempt?.status ?? null,
      score:
        attempt?.status === AssessmentAttemptStatus.COMPLETED
          ? attempt.score
          : null,
    };
  }

  private scopeNodes(scope: any): any[] {
    if (scope.section)
      return [
        scope.section,
        scope.section.lesson,
        scope.section.lesson.chapter,
        scope.section.lesson.chapter.course,
      ];
    if (scope.lesson)
      return [scope.lesson, scope.lesson.chapter, scope.lesson.chapter.course];
    if (scope.chapter) return [scope.chapter, scope.chapter.course];
    return [scope.course];
  }

  /** Whether an ADMIN-owned, READY assessment is visible/attemptable by this
   * student: EVERY one of its scopes must have full published ancestry, match
   * the student's grade, and grant effective access (PUBLIC/FREE or an active
   * entitlement on the course or an ancestor chapter) — the frozen snapshot is
   * the UNION of all scopes' questions, so any per-scope failure must hide the
   * whole assessment (fail closed), not just that one scope. */
  private async assessmentVisible(
    studentId: string,
    gradeId: string | null,
    scopes: any[],
  ) {
    if (!scopes.length) return false;
    for (const scope of scopes) {
      const nodes = this.scopeNodes(scope);
      if (nodes.some((node) => node.status !== ContentStatus.PUBLISHED))
        return false;
      const course = nodes.at(-1);
      if (gradeId && course.subject.academicGradeId !== gradeId) return false;
      if (!(await this.access.entitledForNodes(studentId, nodes))) return false;
    }
    return true;
  }

  /**
   * Hydrates every SQL-matched assessment in bounded batches. Student-facing
   * visibility is decided in application code, so stopping after one SQL page
   * would make both the result set and its pagination total incomplete.
   */
  private async searchedAssessments(
    query: string,
    scope: ArabicSearchScope,
    args?: Record<string, unknown>,
  ): Promise<any[]> {
    const first = await searchArabicOffsetPage(
      this.prisma,
      'assessment',
      query,
      {
        scope,
        orderBy: Prisma.sql`t."createdAt" DESC, t.id DESC`,
        page: 1,
        limit: ASSESSMENT_SEARCH_BATCH_SIZE,
      },
    );
    if (!first.ids.length) return [];

    const pages = [first];
    const pageCount = Math.ceil(first.total / ASSESSMENT_SEARCH_BATCH_SIZE);
    for (let page = 2; page <= pageCount; page++) {
      pages.push(
        await searchArabicOffsetPage(this.prisma, 'assessment', query, {
          scope,
          orderBy: Prisma.sql`t."createdAt" DESC, t.id DESC`,
          page,
          limit: ASSESSMENT_SEARCH_BATCH_SIZE,
        }),
      );
    }

    const records: any[] = [];
    for (const matched of pages) {
      const rows = await this.prisma.assessment.findMany({
        ...args,
        where: { id: { in: matched.ids } },
      });
      records.push(...orderByIds(rows, matched.ids));
    }
    return records;
  }

  async list(studentId: string, query: QueryAssessmentDto) {
    const gradeId = await this.prisma.studentProfile
      .findUnique({
        where: { userId: studentId },
        select: { academicGradeId: true },
      })
      .then((x) => x?.academicGradeId ?? null);
    const searchQuery = resolveSearchQuery(query);
    const own = searchQuery
      ? await this.searchedAssessments(searchQuery, {
          where: Prisma.sql`
            t."ownerType" = ${AssessmentOwnerType.STUDENT}::"AssessmentOwnerType"
            AND t."studentUserId" = ${studentId}
            AND t.status <> 'ARCHIVED'::"AssessmentStatus"
          `,
        })
      : await this.prisma.assessment.findMany({
          where: {
            ownerType: AssessmentOwnerType.STUDENT,
            studentUserId: studentId,
            status: { not: AssessmentStatus.ARCHIVED },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
    const adminCandidates = searchQuery
      ? await this.searchedAssessments(
          searchQuery,
          {
            where: Prisma.sql`
              t."ownerType" = ${AssessmentOwnerType.ADMIN}::"AssessmentOwnerType"
              AND t.status = ${AssessmentStatus.READY}::"AssessmentStatus"
            `,
          },
          { include: { scopes: { include: scopeInclude } } },
        )
      : await this.prisma.assessment.findMany({
          where: {
            ownerType: AssessmentOwnerType.ADMIN,
            status: AssessmentStatus.READY,
          },
          include: { scopes: { include: scopeInclude } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
    const visibility = await Promise.all(
      adminCandidates.map((assessment) =>
        this.assessmentVisible(studentId, gradeId, assessment.scopes),
      ),
    );
    const visiblePublic = adminCandidates.filter(
      (_, index) => visibility[index],
    );
    const ids = [...own.map((x) => x.id), ...visiblePublic.map((x) => x.id)];
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: { studentUserId: studentId, assessmentId: { in: ids } },
    });
    const byAssessment = new Map(attempts.map((a) => [a.assessmentId, a]));
    let merged = [
      ...own.map((x) => ({ assessment: x, visibility: 'MINE' as const })),
      ...visiblePublic.map((x) => ({
        assessment: x,
        visibility: 'PUBLIC' as const,
      })),
    ];
    if (query.status && query.status !== 'ALL')
      merged = merged.filter(
        (x) => byAssessment.get(x.assessment.id)?.status === query.status,
      );
    merged.sort(
      (a, b) =>
        b.assessment.createdAt.getTime() - a.assessment.createdAt.getTime(),
    );
    const start = (query.page - 1) * query.limit;
    return {
      data: merged
        .slice(start, start + query.limit)
        .map((x) =>
          this.listItemDto(
            x.assessment,
            x.visibility,
            byAssessment.get(x.assessment.id),
          ),
        ),
      meta: toPaginationMeta(query.page, query.limit, merged.length),
    };
  }

  private async assessmentWithScopes(id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        scopes: { include: scopeInclude },
        questionBank: { select: { id: true, title: true } },
        questionBanks: { include: { questionBank: { select: { id: true, title: true } } } },
      },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  private async assertViewable(
    studentId: string,
    assessment: any,
  ): Promise<'MINE' | 'PUBLIC'> {
    if (assessment.ownerType === AssessmentOwnerType.STUDENT) {
      if (assessment.studentUserId !== studentId)
        throw new ForbiddenException('Assessment is not accessible');
      return 'MINE';
    }
    if (assessment.status !== AssessmentStatus.READY)
      throw new ForbiddenException('Assessment is not accessible');
    const gradeId = await this.prisma.studentProfile
      .findUnique({
        where: { userId: studentId },
        select: { academicGradeId: true },
      })
      .then((x) => x?.academicGradeId ?? null);
    if (!(await this.assessmentVisible(studentId, gradeId, assessment.scopes)))
      throw new ForbiddenException('Assessment is not accessible');
    return 'PUBLIC';
  }

  async get(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    const visibility = await this.assertViewable(studentId, assessment);
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: {
        assessmentId_studentUserId: {
          assessmentId: id,
          studentUserId: studentId,
        },
      },
    });
    return {
      ...this.listItemDto(assessment, visibility, attempt),
      questionBankId: assessment.questionBankId,
      questionBankName: assessment.questionBank?.title ?? null,
      questionBankIds: assessment.questionBanks?.length
        ? assessment.questionBanks.map((bank: any) => bank.questionBankId)
        : assessment.questionBankId
          ? [assessment.questionBankId]
          : [],
      questionBanks: assessment.questionBanks?.length
        ? assessment.questionBanks.map((bank: any) => ({ id: bank.questionBank.id, name: bank.questionBank.title }))
        : assessment.questionBank
          ? [{ id: assessment.questionBank.id, name: assessment.questionBank.title }]
          : [],
      generationFilters: assessment.generationFilters,
      scopes: assessment.scopes.map((s: any) => ({
        ...this.scopeDto(s),
      })),
    };
  }

  /**
   * Verifies that a student can reach a video through an immutable assessment
   * question snapshot.  The snapshot, rather than the live question link, is
   * the authorization source so historic assessments remain self-contained.
   */
  async assertSnapshotVideoAccess(studentId: string, assetId: string) {
    const snapshots = await this.prisma.assessmentQuestion.findMany({
      where: { videoAssetId: assetId },
      include: { assessment: { include: { scopes: { include: scopeInclude } } } },
    });
    for (const snapshot of snapshots) {
      try {
        await this.assertViewable(studentId, snapshot.assessment);
        return;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
      const completedAttempt = await this.prisma.assessmentAttempt.findUnique({
        where: {
          assessmentId_studentUserId: {
            assessmentId: snapshot.assessment.id,
            studentUserId: studentId,
          },
        },
        select: { status: true },
      });
      if (completedAttempt?.status === AssessmentAttemptStatus.COMPLETED) return;
    }
    throw new NotFoundException('Accessible assessment video not found');
  }

  async questionAttachmentAccess(
    studentId: string,
    assessmentId: string,
    questionId: string,
    assetId: string,
  ) {
    const snapshot = await this.prisma.assessmentQuestion.findFirst({
      where: {
        id: questionId,
        assessmentId,
        attachments: { some: { assetId } },
      },
      include: { assessment: { include: { scopes: { include: scopeInclude } } } },
    });
    if (!snapshot) throw new NotFoundException('Assessment question attachment not found');
    try {
      await this.assertViewable(studentId, snapshot.assessment);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      const completedAttempt = await this.prisma.assessmentAttempt.findUnique({
        where: { assessmentId_studentUserId: { assessmentId, studentUserId: studentId } },
        select: { status: true },
      });
      if (completedAttempt?.status !== AssessmentAttemptStatus.COMPLETED)
        throw new NotFoundException('Assessment question attachment not found');
    }
    const asset = await this.assets.getReady(assetId);
    return asset.kind === AssetKind.VIDEO
      ? this.videos.playback(assetId)
      : this.assets.protectedAccess(asset);
  }

  async rename(studentId: string, id: string, dto: RenameAssessmentDto) {
    const assessment = await this.assessmentWithScopes(id);
    if (
      assessment.ownerType !== AssessmentOwnerType.STUDENT ||
      assessment.studentUserId !== studentId
    )
      throw new ForbiddenException('Assessment is not accessible');
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('title must not be blank');
    await this.prisma.assessment.update({ where: { id }, data: { title } });
    return this.get(studentId, id);
  }

  async remove(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    if (
      assessment.ownerType !== AssessmentOwnerType.STUDENT ||
      assessment.studentUserId !== studentId
    )
      throw new ForbiddenException('Assessment is not accessible');
    await this.prisma.assessment.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- Student: attempt lifecycle ---------------------------------------

  private async questionsForAssessment(id: string) {
    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: id },
      include: { options: { orderBy: { sortOrder: 'asc' } }, placements: true, contexts: { include: { assessmentContext: true }, orderBy: { sortOrder: 'asc' } }, attachments: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async markedQuestionIds(studentId: string, questionIds: string[]) {
    if (!questionIds.length) return new Set<string>();
    const marks = await this.prisma.studentQuestionMark.findMany({
      where: {
        studentUserId: studentId,
        questionId: { in: questionIds },
      },
      select: { questionId: true },
    });
    return new Set(marks.map((mark) => mark.questionId));
  }

  private async questionNotesByQuestionId(studentId: string, questionIds: string[]) {
    if (!questionIds.length) return new Map<string, string>();
    const notes = await this.prisma.studentQuestionNote.findMany({
      where: { studentUserId: studentId, questionId: { in: questionIds } },
      select: { questionId: true, body: true },
    });
    return new Map(notes.map((note) => [note.questionId, note.body]));
  }

  async startAttempt(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    const existing = await this.prisma.assessmentAttempt.findUnique({
      where: {
        assessmentId_studentUserId: {
          assessmentId: id,
          studentUserId: studentId,
        },
      },
    });
    if (existing)
      return this.attemptStateDto(
        await this.ensureNotExpired(existing),
        assessment,
      );
    await this.assertViewable(studentId, assessment);
    if (assessment.status !== AssessmentStatus.READY)
      throw new ConflictException('Assessment is not available to attempt');
    const now = new Date();
    const attempt = await this.createAttempt(id, studentId, assessment, now);
    return this.attemptStateDto(attempt, assessment);
  }

  /** Guards against two concurrent start requests both passing the `existing`
   * check above and racing to create — the loser hits the unique constraint
   * on (assessmentId, studentUserId) and resumes the winner's attempt instead
   * of surfacing an unhandled 500. */
  private async createAttempt(
    assessmentId: string,
    studentId: string,
    assessment: any,
    now: Date,
  ) {
    try {
      return await this.prisma.assessmentAttempt.create({
        data: {
          assessmentId,
          studentUserId: studentId,
          startedAt: now,
          lastActivityAt: now,
          expiresAt:
            assessment.isTimed && assessment.durationSeconds
              ? new Date(now.getTime() + assessment.durationSeconds * 1000)
              : null,
          totalQuestions: assessment.questionCount,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.ensureNotExpired(
          await this.ownAttempt(studentId, assessmentId),
        );
      }
      throw error;
    }
  }

  private async ownAttempt(studentId: string, id: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: {
        assessmentId_studentUserId: {
          assessmentId: id,
          studentUserId: studentId,
        },
      },
    });
    if (!attempt)
      throw new NotFoundException(
        'No attempt has been started for this assessment',
      );
    return attempt;
  }

  /** Lighter than assessmentWithScopes: used once an attempt already exists,
   * where the (assessmentId, studentUserId) attempt row is itself the proof
   * of access — this keeps a completed/in-progress attempt's state and result
   * readable even after an admin archives the assessment. */
  private async assessmentOrNotFound(id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  /** Idempotent and race-safe: the status transition is gated by a conditional
   * updateMany keyed on SUSPENDED, so if two finalizers race (a concurrent
   * submit and an expiry auto-finalize, or two concurrent submits), the loser
   * matches zero rows — Postgres re-evaluates its WHERE clause against the
   * winner's already-committed row — and it just returns the winner's final
   * state instead of re-scoring or clobbering it. */
  private async finalizeAttempt(attemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      const gate = await tx.assessmentAttempt.updateMany({
        where: { id: attemptId, status: AssessmentAttemptStatus.SUSPENDED },
        data: {
          status: AssessmentAttemptStatus.COMPLETED,
          submittedAt: new Date(),
        },
      });
      if (gate.count === 0)
        return tx.assessmentAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });
      const attempt = await tx.assessmentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      if (!attempt) {
        const answers = await tx.assessmentAttemptAnswer.findMany({
          where: { attemptId },
        });
        return tx.assessmentAttempt.update({
          where: { id: attemptId },
          data: { score: answers.filter((a) => a.isCorrect).length },
        });
      }
      const questions = await tx.assessmentQuestion.findMany({
        where: { assessmentId: attempt.assessmentId },
        select: { id: true, sourceQuestionId: true },
      });
      const answers = await tx.assessmentAttemptAnswer.findMany({
        where: { attemptId },
      });
      const byQuestion = new Map(
        answers.map((answer) => [answer.assessmentQuestionId, answer]),
      );
      for (const question of questions) {
        const answer = byQuestion.get(question.id);
        const outcome = !answer?.selectedOptionIds.length
          ? AssessmentQuestionOutcome.OMITTED
          : answer.isCorrect
            ? AssessmentQuestionOutcome.CORRECT
            : AssessmentQuestionOutcome.INCORRECT;
        if (answer)
          await tx.assessmentAttemptAnswer.update({
            where: { id: answer.id },
            data: { outcome },
          });
        else
          await tx.assessmentAttemptAnswer.create({
            data: {
              attemptId,
              assessmentQuestionId: question.id,
              selectedOptionIds: [],
              isCorrect: false,
              outcome,
            },
          });
        if (outcome !== AssessmentQuestionOutcome.OMITTED)
          await this.communityStats.recordResponse(
            tx,
            question.sourceQuestionId,
            outcome === AssessmentQuestionOutcome.CORRECT,
          );
      }
      const score = answers.filter(
        (a) => a.isCorrect && a.selectedOptionIds.length,
      ).length;
      return tx.assessmentAttempt.update({
        where: { id: attemptId },
        data: { score },
      });
    });
  }

  private async ensureNotExpired(attempt: any) {
    if (attempt.status === AssessmentAttemptStatus.COMPLETED) return attempt;
    if (!attempt.expiresAt || attempt.expiresAt > new Date()) return attempt;
    return this.finalizeAttempt(attempt.id);
  }

  private async attemptStateDto(attempt: any, assessment: any) {
    const current = await this.ensureNotExpired(attempt);
    const questions = await this.questionsForAssessment(assessment.id);
    const markedQuestionIds = await this.markedQuestionIds(
      attempt.studentUserId,
      questions.map((question) => question.sourceQuestionId),
    );
    const notesByQuestionId = await this.questionNotesByQuestionId(
      attempt.studentUserId,
      questions.map((question) => question.sourceQuestionId),
    );
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: { attemptId: current.id },
    });
    const byQuestion = new Map(answers.map((a) => [a.assessmentQuestionId, a]));
    const revealAnswers = current.status === AssessmentAttemptStatus.COMPLETED;
    return {
      attemptId: current.id,
      status: current.status,
      startedAt: current.startedAt,
      expiresAt: current.expiresAt,
      submittedAt: current.submittedAt,
      score:
        current.status === AssessmentAttemptStatus.COMPLETED
          ? current.score
          : null,
      totalQuestions: current.totalQuestions,
      mode: assessment.mode,
      questions: questions.map((q) => {
        const answer = byQuestion.get(q.id);
        const showAnswer =
          revealAnswers ||
          (assessment.mode === AssessmentMode.TUTOR && Boolean(answer));
        return {
          id: q.id,
          isMarked: markedQuestionIds.has(q.sourceQuestionId),
          note: notesByQuestionId.get(q.sourceQuestionId) ?? null,
          sortOrder: q.sortOrder,
          type: q.type,
          body: q.body,
          video: q.videoAssetId
            ? {
                assetId: q.videoAssetId,
                assetName: q.videoAssetName,
                timestampSeconds: q.timestampSeconds,
              }
            : null,
          attachments: (q.attachments ?? []).map((attachment) => ({
            assetId: attachment.assetId,
            kind: attachment.assetKind,
            assetName: attachment.assetName,
            sortOrder: attachment.sortOrder,
          })),
          contexts: q.contexts.map((link) => link.assessmentContext),
          options: q.options.map((o) => ({
            id: o.id,
            body: o.body,
            sortOrder: o.sortOrder,
          })),
          selectedOptionIds: answer?.selectedOptionIds ?? [],
          answered: Boolean(answer && answer.selectedOptionIds.length),
          isCorrect: showAnswer ? (answer?.isCorrect ?? false) : null,
          outcome: revealAnswers
            ? (answer?.outcome ?? AssessmentQuestionOutcome.OMITTED)
            : null,
          correctOptionIds: showAnswer
            ? q.options.filter((o) => o.isCorrect).map((o) => o.id)
            : null,
          explanation: showAnswer ? q.explanation : null,
          structuredExplanation: showAnswer ? q.structuredExplanation : null,
        };
      }),
    };
  }

  async currentAttemptState(studentId: string, id: string) {
    const assessment = await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    return this.attemptStateDto(attempt, assessment);
  }

  async autosaveAnswer(
    studentId: string,
    id: string,
    assessmentQuestionId: string,
    dto: AutosaveAnswerDto,
  ) {
    const assessment = await this.assessmentOrNotFound(id);
    const attempt = await this.ensureNotExpired(
      await this.ownAttempt(studentId, id),
    );
    if (attempt.status !== AssessmentAttemptStatus.SUSPENDED)
      throw new ConflictException('Attempt is no longer in progress');
    if (new Set(dto.selectedOptionIds).size !== dto.selectedOptionIds.length)
      throw new BadRequestException(
        'selectedOptionIds must not contain duplicates',
      );
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: assessmentQuestionId, assessmentId: id },
      include: { options: true },
    });
    if (!question) throw new NotFoundException('Assessment question not found');
    if (
      !dto.selectedOptionIds.every((optionId) =>
        question.options.some((o) => o.id === optionId),
      )
    )
      throw new BadRequestException(
        'Selected options do not belong to the question',
      );
    if (
      question.type === QuestionType.SINGLE_CHOICE &&
      dto.selectedOptionIds.length > 1
    )
      throw new BadRequestException(
        'Single-choice questions accept at most one option',
      );
    const correct = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id)
      .sort();
    const selected = [...dto.selectedOptionIds].sort();
    const isCorrect =
      selected.length > 0 &&
      correct.length === selected.length &&
      correct.every((id, index) => id === selected[index]);
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.assessmentAttempt.updateMany({
        where: { id: attempt.id, status: AssessmentAttemptStatus.SUSPENDED },
        data: { lastActivityAt: new Date() },
      });
      if (gate.count === 0)
        throw new ConflictException('Attempt is no longer in progress');
      const existing = await tx.assessmentAttemptAnswer.findUnique({
        where: {
          attemptId_assessmentQuestionId: {
            attemptId: attempt.id,
            assessmentQuestionId,
          },
        },
      });
      const sameSelection =
        existing &&
        existing.selectedOptionIds.length === selected.length &&
        existing.selectedOptionIds.every((optionId) =>
          selected.includes(optionId),
        );
      const answer = await tx.assessmentAttemptAnswer.upsert({
        where: {
          attemptId_assessmentQuestionId: {
            attemptId: attempt.id,
            assessmentQuestionId,
          },
        },
        create: {
          attemptId: attempt.id,
          assessmentQuestionId,
          selectedOptionIds: selected,
          isCorrect,
        },
        update: { selectedOptionIds: selected, isCorrect },
      });
      if (existing && !sameSelection) {
        const outcome = (optionIds: string[], correctAnswer: boolean | null) =>
          optionIds.length === 0
            ? AssessmentQuestionOutcome.OMITTED
            : correctAnswer
              ? AssessmentQuestionOutcome.CORRECT
              : AssessmentQuestionOutcome.INCORRECT;
        await tx.assessmentAnswerChange.create({
          data: {
            attemptAnswerId: answer.id,
            fromOptionIds: existing.selectedOptionIds,
            toOptionIds: selected,
            fromOutcome: outcome(
              existing.selectedOptionIds,
              existing.isCorrect,
            ),
            toOutcome: outcome(selected, isCorrect),
          },
        });
      }
    });
    return {
      assessmentQuestionId,
      selectedOptionIds: dto.selectedOptionIds,
      isCorrect: assessment.mode === AssessmentMode.TUTOR ? isCorrect : null,
      correctOptionIds:
        assessment.mode === AssessmentMode.TUTOR ? correct : null,
      explanation:
        assessment.mode === AssessmentMode.TUTOR ? question.explanation : null,
    };
  }

  async reportActiveTime(
    studentId: string,
    id: string,
    assessmentQuestionId: string,
    dto: ReportActiveTimeDto,
  ) {
    await this.assessmentOrNotFound(id);
    const attempt = await this.ensureNotExpired(
      await this.ownAttempt(studentId, id),
    );
    if (attempt.status !== AssessmentAttemptStatus.SUSPENDED)
      throw new ConflictException('Attempt is no longer in progress');
    const question = await this.prisma.assessmentQuestion.findFirst({
      where: { id: assessmentQuestionId, assessmentId: id },
      select: { id: true },
    });
    if (!question) throw new NotFoundException('Assessment question not found');
    const activeSeconds = await this.prisma.$transaction(async (tx) => {
      // This update locks the attempt row until the monotonic upsert completes,
      // so submission/expiry cannot race a report into a completed attempt.
      const gate = await tx.assessmentAttempt.updateMany({
        where: { id: attempt.id, status: AssessmentAttemptStatus.SUSPENDED },
        data: { lastActivityAt: new Date() },
      });
      if (!gate.count)
        throw new ConflictException('Attempt is no longer in progress');
      const rows = await tx.$queryRaw<{ activeSeconds: number }[]>`
        INSERT INTO "AssessmentAttemptAnswer"
          ("id", "attemptId", "assessmentQuestionId", "selectedOptionIds", "activeSeconds", "answeredAt", "updatedAt")
        VALUES
          (${`active_${randomUUID()}`}, ${attempt.id}, ${assessmentQuestionId}, ARRAY[]::TEXT[], ${dto.activeSeconds}, NOW(), NOW())
        ON CONFLICT ("attemptId", "assessmentQuestionId")
        DO UPDATE SET
          "activeSeconds" = GREATEST("AssessmentAttemptAnswer"."activeSeconds", EXCLUDED."activeSeconds"),
          "updatedAt" = NOW()
        RETURNING "activeSeconds"
      `;
      return rows[0].activeSeconds;
    });
    return { assessmentQuestionId, activeSeconds };
  }

  async submitAttempt(studentId: string, id: string) {
    await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    const final =
      attempt.status === AssessmentAttemptStatus.COMPLETED
        ? attempt
        : await this.finalizeAttempt(attempt.id);
    return {
      attemptId: final.id,
      status: final.status,
      score: final.score,
      totalQuestions: final.totalQuestions,
      submittedAt: final.submittedAt,
    };
  }

  private round(value: number, decimals = 1) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private async comparison(
    studentId: string,
    questions: any[],
    answersByQuestion: Map<string, any>,
  ) {
    const chapters = new Map<string, any>();
    for (const question of questions) {
      const outcome = answersByQuestion.get(question.id)?.outcome;
      for (const placement of question.placements.filter(
        (item: any) => item.chapterId,
      )) {
        const chapter = chapters.get(placement.chapterId) ?? {
          chapterId: placement.chapterId,
          chapterTitle: placement.chapterTitle,
          courseId: placement.courseId,
          subjectId: placement.subjectId,
          total: 0,
          correct: 0,
        };
        chapter.total++;
        if (outcome === AssessmentQuestionOutcome.CORRECT) chapter.correct++;
        chapters.set(placement.chapterId, chapter);
      }
    }
    if (!chapters.size)
      return {
        status: 'NOT_APPLICABLE',
        reason: 'COMPARISON_REQUIRES_CHAPTER_PLACEMENTS',
        sampleSize: 0,
        platformAveragePercentage: null,
        differenceFromAverage: null,
        percentile: null,
        performanceLabel: null,
        chapters: [],
      };

    const chapterIds = [...chapters.keys()];
    const peerAnswers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        attempt: {
          status: AssessmentAttemptStatus.COMPLETED,
          studentUserId: { not: studentId },
        },
        assessmentQuestion: {
          placements: { some: { chapterId: { in: chapterIds } } },
        },
      },
      include: {
        attempt: { select: { id: true } },
        assessmentQuestion: {
          select: {
            placements: {
              where: { chapterId: { in: chapterIds } },
              select: { chapterId: true },
            },
          },
        },
      },
    });
    const peerByAttemptAndChapter = new Map<
      string,
      { chapterId: string; total: number; correct: number }
    >();
    for (const answer of peerAnswers)
      for (const placement of answer.assessmentQuestion.placements) {
        if (!placement.chapterId) continue;
        const key = `${answer.attempt.id}:${placement.chapterId}`;
        const value = peerByAttemptAndChapter.get(key) ?? {
          chapterId: placement.chapterId,
          total: 0,
          correct: 0,
        };
        value.total++;
        if (answer.outcome === AssessmentQuestionOutcome.CORRECT)
          value.correct++;
        peerByAttemptAndChapter.set(key, value);
      }
    const minimum = this.config.get('platformComparisonMinSample', {
      infer: true,
    });
    const chapterComparisons = [...chapters.values()].map((chapter) => {
      const peers = [...peerByAttemptAndChapter.values()]
        .filter(
          (peer) => peer.chapterId === chapter.chapterId && peer.total > 0,
        )
        .map((peer) => (peer.correct / peer.total) * 100);
      const sampleSize = peers.length;
      const percentage = (chapter.correct / chapter.total) * 100;
      if (sampleSize < minimum)
        return {
          status: 'INSUFFICIENT_DATA',
          ...chapter,
          percentage: this.round(percentage),
          sampleSize,
          platformAveragePercentage: null,
          differenceFromAverage: null,
          percentile: null,
        };
      const average = peers.reduce((sum, value) => sum + value, 0) / sampleSize;
      return {
        status: 'AVAILABLE',
        ...chapter,
        percentage: this.round(percentage),
        sampleSize,
        platformAveragePercentage: this.round(average),
        differenceFromAverage: this.round(percentage - average),
        percentile: Math.round(
          (peers.filter((value) => value <= percentage).length / sampleSize) *
            100,
        ),
      };
    });
    const available = chapterComparisons.filter(
      (chapter) => chapter.status === 'AVAILABLE',
    );
    const total = chapterComparisons.reduce(
      (sum, chapter) => sum + chapter.total,
      0,
    );
    const weightedPercentage =
      chapterComparisons.reduce(
        (sum, chapter) => sum + chapter.percentage * chapter.total,
        0,
      ) / total;
    const weightedSampleSize = available.length
      ? Math.min(...available.map((chapter) => chapter.sampleSize))
      : 0;
    const context = {
      sampleSize: weightedSampleSize,
      coveredChapterCount: chapterComparisons.length,
      unclassifiedQuestionCount: questions.filter(
        (question) =>
          !question.placements.some((placement: any) => placement.chapterId),
      ).length,
      chapters: chapterComparisons,
    };
    if (available.length !== chapterComparisons.length)
      return {
        status: 'INSUFFICIENT_DATA',
        ...context,
        platformAveragePercentage: null,
        differenceFromAverage: null,
        percentile: null,
        performanceLabel: null,
      };
    const weightedAverage =
      available.reduce(
        (sum, chapter) =>
          sum + chapter.platformAveragePercentage * chapter.total,
        0,
      ) / total;
    const weightedPercentile = Math.round(
      available.reduce(
        (sum, chapter) => sum + chapter.percentile * chapter.total,
        0,
      ) / total,
    );
    const performanceLabel =
      weightedPercentile >= 90
        ? 'EXCELLENT'
        : weightedPercentile >= 60
          ? 'GOOD_PROGRESS'
          : 'NEEDS_IMPROVEMENT';
    return {
      status: 'AVAILABLE',
      ...context,
      platformAveragePercentage: this.round(weightedAverage),
      differenceFromAverage: this.round(weightedPercentage - weightedAverage),
      percentile: weightedPercentile,
      performanceLabel,
    };
  }

  async result(
    studentId: string,
    id: string,
    query: AssessmentResultQueryDto = {},
  ) {
    await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    if (attempt.status !== AssessmentAttemptStatus.COMPLETED)
      throw new ConflictException('Attempt has not been submitted yet');
    const questions = await this.questionsForAssessment(id);
    const markedQuestionIds = await this.markedQuestionIds(
      studentId,
      questions.map((question) => question.sourceQuestionId),
    );
    const notesByQuestionId = await this.questionNotesByQuestionId(
      studentId,
      questions.map((question) => question.sourceQuestionId),
    );
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: { attemptId: attempt.id },
    });
    const byQuestion = new Map(answers.map((a) => [a.assessmentQuestionId, a]));
    const outcomes = answers.map((answer) => answer.outcome);
    const correctCount = outcomes.filter(
      (outcome) => outcome === AssessmentQuestionOutcome.CORRECT,
    ).length;
    const incorrectCount = outcomes.filter(
      (outcome) => outcome === AssessmentQuestionOutcome.INCORRECT,
    ).length;
    const omittedCount = outcomes.filter(
      (outcome) => outcome === AssessmentQuestionOutcome.OMITTED,
    ).length;
    const percentage = this.round(
      ((attempt.score ?? 0) / attempt.totalQuestions) * 100,
    );
    const stats = await this.prisma.questionCommunityStat.findMany({
      where: {
        questionId: {
          in: questions.map((question) => question.sourceQuestionId),
        },
      },
      select: {
        questionId: true,
        totalResponses: true,
        correctResponses: true,
      },
    });
    const statsByQuestion = new Map(
      stats.map((stat) => [stat.questionId, stat]),
    );
    const result: any = {
      attemptId: attempt.id,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      percentage,
      correctCount,
      incorrectCount,
      omittedCount,
      answeredCount: correctCount + incorrectCount,
      submittedAt: attempt.submittedAt,
      questions: questions.map((q) => {
        const answer = byQuestion.get(q.id);
        const stat = statsByQuestion.get(q.sourceQuestionId);
        return {
          id: q.id,
          sourceQuestionId: q.sourceQuestionId,
          isMarked: markedQuestionIds.has(q.sourceQuestionId),
          note: notesByQuestionId.get(q.sourceQuestionId) ?? null,
          sortOrder: q.sortOrder,
          type: q.type,
          body: q.body,
          video: q.videoAssetId
            ? {
                assetId: q.videoAssetId,
                assetName: q.videoAssetName,
                timestampSeconds: q.timestampSeconds,
              }
            : null,
          attachments: (q.attachments ?? []).map((attachment) => ({
            assetId: attachment.assetId,
            kind: attachment.assetKind,
            assetName: attachment.assetName,
            sortOrder: attachment.sortOrder,
          })),
          explanation: q.explanation,
          options: q.options.map((o) => ({
            id: o.id,
            body: o.body,
            isCorrect: o.isCorrect,
          })),
          selectedOptionIds: answer?.selectedOptionIds ?? [],
          isCorrect: answer?.isCorrect ?? false,
          answered: Boolean(answer && answer.selectedOptionIds.length),
          outcome: answer?.outcome ?? AssessmentQuestionOutcome.OMITTED,
          activeSeconds: answer?.activeSeconds ?? null,
          placements: q.placements,
          platformSuccessRate: stat?.totalResponses
            ? this.round((stat.correctResponses / stat.totalResponses) * 100)
            : null,
        };
      }),
    };
    if (query.includeComparison !== 'false')
      result.comparison = await this.comparison(
        studentId,
        questions,
        byQuestion,
      );
    return result;
  }

  async analytics(studentId: string, query: AssessmentAnalyticsQueryDto) {
    const searchQuery = resolveSearchQuery(query);
    const normalizedSearch = searchQuery
      ? normalizeArabic(searchQuery)
      : undefined;
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        attempt: {
          studentUserId: studentId,
          status: AssessmentAttemptStatus.COMPLETED,
        },
        assessmentQuestion: {
          placements: {
            some: query.chapterId
              ? { chapterId: query.chapterId }
              : query.subjectId
                ? { subjectId: query.subjectId }
                : {},
          },
        },
      },
      include: {
        attempt: {
          select: {
            assessmentId: true,
            score: true,
            totalQuestions: true,
            submittedAt: true,
            assessment: { select: { title: true, mode: true } },
          },
        },
        assessmentQuestion: { include: { placements: true } },
      },
    });
    const level = query.chapterId
      ? 'topic'
      : query.subjectId
        ? 'chapter'
        : 'subject';
    const groups = new Map<string, any>();
    for (const answer of answers) {
      const placements = answer.assessmentQuestion.placements
        .filter(
          (placement) =>
            !query.subjectId || placement.subjectId === query.subjectId,
        )
        .filter(
          (placement) =>
            !query.chapterId || placement.chapterId === query.chapterId,
        );
      const distinct = new Map<string, any>();
      for (const placement of placements) {
        const id =
          level === 'subject'
            ? placement.subjectId
            : level === 'chapter'
              ? placement.chapterId
              : (placement.sectionId ??
                placement.lessonId ??
                placement.chapterId);
        if (!id) continue;
        const title =
          level === 'subject'
            ? placement.subjectTitle
            : level === 'chapter'
              ? placement.chapterTitle
              : (placement.sectionTitle ??
                placement.lessonTitle ??
                placement.chapterTitle);
        distinct.set(id, {
          id,
          title,
          subjectId: placement.subjectId,
          chapterId: placement.chapterId,
          lessonId: placement.lessonId,
          sectionId: placement.sectionId,
        });
      }
      for (const group of distinct.values()) {
        const value = groups.get(group.id) ?? {
          ...group,
          total: 0,
          correct: 0,
          incorrect: 0,
          omitted: 0,
        };
        value.total++;
        if (answer.outcome === AssessmentQuestionOutcome.CORRECT)
          value.correct++;
        else if (answer.outcome === AssessmentQuestionOutcome.INCORRECT)
          value.incorrect++;
        else value.omitted++;
        groups.set(group.id, value);
      }
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const grouped = [...groups.values()]
      .filter(
        (group) =>
          !normalizedSearch ||
          normalizeArabic(group.title).includes(normalizedSearch),
      )
      .map((group) => ({
        ...group,
        answered: group.correct + group.incorrect,
        percentage: group.total
          ? this.round((group.correct / group.total) * 100)
          : 0,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    const groupMeta = toPaginationMeta(page, limit, grouped.length);
    const data = grouped.slice((page - 1) * limit, page * limit);
    const attemptCandidates = query.chapterId
      ? await this.prisma.assessmentAttempt.findMany({
          where: {
            studentUserId: studentId,
            status: AssessmentAttemptStatus.COMPLETED,
            assessment: {
              questions: {
                some: { placements: { some: { chapterId: query.chapterId } } },
              },
            },
          },
          select: {
            id: true,
            assessmentId: true,
            score: true,
            totalQuestions: true,
            submittedAt: true,
            assessment: { select: { title: true, mode: true } },
          },
          orderBy: { submittedAt: 'desc' },
        })
      : [];
    const matchingAttempts = attemptCandidates.filter(
      (attempt) =>
        !normalizedSearch ||
        normalizeArabic(attempt.assessment.title).includes(normalizedSearch),
    );
    const attempts = matchingAttempts.slice((page - 1) * limit, page * limit);
    return {
      level,
      data,
      attempts,
      meta: {
        groups: groupMeta,
        ...(query.chapterId
          ? { attempts: toPaginationMeta(page, limit, matchingAttempts.length) }
          : {}),
      },
    };
  }

  // --- Admin ---------------------------------------------------------------

  private async log(
    actor: RequestUser,
    action: string,
    targetId: string,
    metadata?: object,
  ) {
    await this.audit.record({
      actorUserId: actor.id,
      action,
      targetType: 'Assessment',
      targetId,
      metadata,
    });
  }

  async createStandard(
    actor: RequestUser,
    dto: GenerateAdminStandardAssessmentDto,
  ) {
    this.assertAdmin(actor);
    if (dto.isTimed && !dto.durationSeconds)
      throw new BadRequestException(
        'durationSeconds is required when isTimed is true',
      );
    if (!dto.scopes?.length)
      throw new BadRequestException('scopes is required');
    const scopes = await this.resolveScopes(dto.scopes);
    const eligible = await this.eligibleQuestions(scopes);
    if (eligible.length < dto.questionCount)
      throw new BadRequestException(
        'Not enough eligible questions in the selected scope',
      );
    const selected = this.shuffle(eligible).slice(0, dto.questionCount);
    const mode = dto.mode ?? AssessmentMode.EXAM;
    const assessment = await this.prisma.$transaction((tx) =>
      this.freezeSnapshot(tx, {
        ownerType: AssessmentOwnerType.ADMIN,
        createdByAdminId: actor.id,
        title: dto.title?.trim() || this.defaultTitle(mode),
        generationType: AssessmentGenerationType.STANDARD,
        mode,
        isTimed: dto.isTimed ?? false,
        durationSeconds: dto.durationSeconds,
        status: AssessmentStatus.DRAFT,
        scopes,
        questions: selected,
      }),
    );
    await this.log(actor, 'ASSESSMENT_CREATED', assessment.id, {
      generationType: 'STANDARD',
    });
    return this.getAdmin(actor, assessment.id);
  }

  async createCustom(actor: RequestUser, dto: CreateCustomAssessmentDto) {
    this.assertAdmin(actor);
    if (dto.isTimed && !dto.durationSeconds)
      throw new BadRequestException(
        'durationSeconds is required when isTimed is true',
      );
    if (new Set(dto.questionIds).size !== dto.questionIds.length)
      throw new BadRequestException('questionIds must not contain duplicates');
    const scopes = await this.resolveScopes(dto.scopes);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: dto.questionIds }, status: QuestionStatus.PUBLISHED },
      include: {
        course: { include: { subject: true } },
        options: { orderBy: { sortOrder: 'asc' } },
        contexts: { include: { context: true }, orderBy: { sortOrder: 'asc' } },
        structuredExplanation: true,
        videoLink: { include: { videoAsset: { include: { asset: true } } } },
        assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        placements: { include: this.questionPlacementInclude() },
      },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = dto.questionIds.map((id) => byId.get(id));
    if (ordered.some((q) => !q))
      throw new BadRequestException(
        'One or more questionIds are invalid or not published',
      );
    if (
      ordered.some(
        (q) =>
          !q!.placements.some(
            (p: any) =>
              scopes.some((s) => this.placementInScope(p, s)) &&
              this.placementPublished(this.placementNodes(p)),
          ),
      )
    )
      throw new BadRequestException(
        'Every question must have a published placement within one of the given scopes',
      );
    const mode = dto.mode ?? AssessmentMode.EXAM;
    const assessment = await this.prisma.$transaction((tx) =>
      this.freezeSnapshot(tx, {
        ownerType: AssessmentOwnerType.ADMIN,
        createdByAdminId: actor.id,
        title: dto.title?.trim() || this.defaultTitle(mode),
        generationType: AssessmentGenerationType.CUSTOM,
        mode,
        isTimed: dto.isTimed ?? false,
        durationSeconds: dto.durationSeconds,
        status: AssessmentStatus.DRAFT,
        scopes,
        questions: ordered as any[],
      }),
    );
    await this.log(actor, 'ASSESSMENT_CREATED', assessment.id, {
      generationType: 'CUSTOM',
    });
    return this.getAdmin(actor, assessment.id);
  }

  async listAdmin(actor: RequestUser, query: QueryAdminAssessmentDto) {
    this.assertAdmin(actor);
    const searchQuery = resolveSearchQuery(query);
    const where = {
      ownerType: AssessmentOwnerType.ADMIN,
      status: query.status,
    };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.assessment,
      target: 'assessment',
      q: searchQuery,
      scope: {
        where: sqlAnd(
          Prisma.sql`t."ownerType" = ${AssessmentOwnerType.ADMIN}::"AssessmentOwnerType"`,
          query.status
            ? Prisma.sql`t.status = ${query.status}::"AssessmentStatus"`
            : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where,
      page: query.page,
      limit: query.limit,
    });
    return {
      data: data.map((x: any) => this.adminListItemDto(x)),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  private adminListItemDto(assessment: any) {
    return {
      id: assessment.id,
      title: assessment.title,
      generationType: assessment.generationType,
      mode: assessment.mode,
      isTimed: assessment.isTimed,
      durationSeconds: assessment.durationSeconds,
      questionCount: assessment.questionCount,
      status: assessment.status,
      createdAt: assessment.createdAt,
      publishedAt: assessment.publishedAt,
      archivedAt: assessment.archivedAt,
    };
  }

  private async adminAssessment(id: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        scopes: { include: scopeInclude },
        questionBank: { select: { id: true, title: true } },
        questionBanks: { include: { questionBank: { select: { id: true, title: true } } } },
        questions: {
          include: { options: { orderBy: { sortOrder: 'asc' } }, attachments: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!assessment || assessment.ownerType !== AssessmentOwnerType.ADMIN)
      throw new NotFoundException('Assessment not found');
    return assessment;
  }

  async getAdmin(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    return {
      ...this.adminListItemDto(assessment),
      questionBankId: assessment.questionBankId,
      questionBankName: assessment.questionBank?.title ?? null,
      questionBankIds: assessment.questionBanks?.length
        ? assessment.questionBanks.map((bank: any) => bank.questionBankId)
        : assessment.questionBankId
          ? [assessment.questionBankId]
          : [],
      questionBanks: assessment.questionBanks?.length
        ? assessment.questionBanks.map((bank: any) => ({ id: bank.questionBank.id, name: bank.questionBank.title }))
        : assessment.questionBank
          ? [{ id: assessment.questionBank.id, name: assessment.questionBank.title }]
          : [],
      scopes: assessment.scopes.map((s: any) => this.scopeDto(s)),
      questions: assessment.questions.map((q: any) => ({
        id: q.id,
        sortOrder: q.sortOrder,
        type: q.type,
        body: q.body,
        explanation: q.explanation,
          video: q.videoAssetId
          ? {
              assetId: q.videoAssetId,
              assetName: q.videoAssetName,
              timestampSeconds: q.timestampSeconds,
            }
            : null,
          attachments: (q.attachments ?? []).map((attachment: any) => ({
            assetId: attachment.assetId,
            kind: attachment.assetKind,
            assetName: attachment.assetName,
            sortOrder: attachment.sortOrder,
          })),
        options: q.options.map((o: any) => ({
          id: o.id,
          body: o.body,
          isCorrect: o.isCorrect,
          sortOrder: o.sortOrder,
        })),
      })),
    };
  }

  async updateAdmin(
    actor: RequestUser,
    id: string,
    dto: UpdateAdminAssessmentDto,
  ) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT)
      throw new ConflictException('Only draft assessments can be updated');
    if (
      (dto.isTimed ?? assessment.isTimed) &&
      !(dto.durationSeconds ?? assessment.durationSeconds)
    )
      throw new BadRequestException(
        'durationSeconds is required when isTimed is true',
      );
    let title: string | undefined;
    if (dto.title !== undefined) {
      title = dto.title.trim();
      if (!title) throw new BadRequestException('title must not be blank');
    }
    await this.prisma.assessment.update({
      where: { id },
      data: {
        title,
        mode: dto.mode,
        isTimed: dto.isTimed,
        durationSeconds: dto.durationSeconds,
      },
    });
    await this.log(actor, 'ASSESSMENT_UPDATED', id);
    return this.getAdmin(actor, id);
  }

  async publish(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT)
      throw new ConflictException('Only draft assessments can be published');
    await this.prisma.assessment.update({
      where: { id },
      data: { status: AssessmentStatus.READY, publishedAt: new Date() },
    });
    await this.log(actor, 'ASSESSMENT_PUBLISHED', id);
    return this.getAdmin(actor, id);
  }

  async archive(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.READY)
      throw new ConflictException('Only published assessments can be archived');
    await this.prisma.assessment.update({
      where: { id },
      data: { status: AssessmentStatus.ARCHIVED, archivedAt: new Date() },
    });
    await this.log(actor, 'ASSESSMENT_ARCHIVED', id);
    return this.getAdmin(actor, id);
  }

  async deleteAdmin(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT)
      throw new ConflictException(
        'Only a never-published draft assessment can be deleted',
      );
    await this.prisma.assessment.delete({ where: { id } });
    await this.log(actor, 'ASSESSMENT_DELETED', id);
    return { id, deleted: true };
  }
}
