import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AssessmentAttemptStatus,
  AssessmentGenerationType,
  AssessmentMode,
  AssessmentOwnerType,
  AssessmentStatus,
  ContentStatus,
  QuestionStatus,
  QuestionType,
  Role,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import {
  orderByIds,
  paginateArabicSearch,
  resolveSearchQuery,
  searchArabicOffsetPage,
  sqlAnd,
  type ArabicSearchScope,
} from '../../common/search/arabic-search';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import type {
  AssessmentScopeDto,
  AutosaveAnswerDto,
  CreateCustomAssessmentDto,
  GenerateStandardAssessmentDto,
  QueryAdminAssessmentDto,
  QueryAssessmentDto,
  RenameAssessmentDto,
  UpdateAdminAssessmentDto,
} from './dto/assessments.dto';

type ScopeField = 'courseId' | 'chapterId' | 'lessonId' | 'sectionId';
type ScopeRow = { courseId?: string | null; chapterId?: string | null; lessonId?: string | null; sectionId?: string | null };

const scopeInclude = {
  course: { include: { subject: true } },
  chapter: { include: { course: { include: { subject: true } } } },
  lesson: { include: { chapter: { include: { course: { include: { subject: true } } } } } },
  section: { include: { lesson: { include: { chapter: { include: { course: { include: { subject: true } } } } } } } },
};

const ASSESSMENT_SEARCH_BATCH_SIZE = 500;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ContentAccessPolicyService,
  ) {}

  private assertAdmin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden');
  }

  private async studentGrade(studentId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { academicGradeId: true } });
    if (!profile?.academicGradeId) throw new ConflictException('Student academic grade is required');
    return profile.academicGradeId;
  }

  // --- Scope resolution -------------------------------------------------

  private async resolveScopes(dtos: AssessmentScopeDto[]): Promise<ScopeRow[]> {
    const seen = new Set<string>();
    const rows: ScopeRow[] = [];
    for (const dto of dtos) {
      const targets = (Object.entries(dto) as [ScopeField, string | undefined][]).filter(([, value]) => Boolean(value));
      if (targets.length !== 1) throw new BadRequestException('Each scope must have exactly one target');
      const [field, id] = targets[0] as [ScopeField, string];
      const key = `${field}:${id}`;
      if (seen.has(key)) throw new BadRequestException('Scopes must be unique');
      seen.add(key);
      const target = await this.resolveNode(field, id);
      if (!target || target.status === ContentStatus.ARCHIVED) throw new NotFoundException(`Scope ${field} not found`);
      rows.push({ courseId: null, chapterId: null, lessonId: null, sectionId: null, [field]: id });
    }
    return rows;
  }

  private resolveNode(field: ScopeField, id: string) {
    if (field === 'courseId') return this.prisma.course.findUnique({ where: { id }, select: { id: true, status: true } });
    if (field === 'chapterId') return this.prisma.chapter.findUnique({ where: { id }, select: { id: true, status: true } });
    if (field === 'lessonId') return this.prisma.lesson.findUnique({ where: { id }, select: { id: true, status: true } });
    return this.prisma.section.findUnique({ where: { id }, select: { id: true, status: true } });
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
    if (scope.lessonId) return placement.lessonId === scope.lessonId || placement.section?.lessonId === scope.lessonId;
    return placement.sectionId === scope.sectionId;
  }

  private placementNodes(placement: any): any[] {
    return placement.section
      ? [placement.section, placement.section.lesson, placement.section.lesson.chapter, placement.section.lesson.chapter.course]
      : placement.lesson
        ? [placement.lesson, placement.lesson.chapter, placement.lesson.chapter.course]
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
    for (const placement of placements) if (await this.access.entitledForNodes(studentId, this.placementNodes(placement))) return true;
    return false;
  }

  private questionPlacementInclude() {
    return {
      course: true,
      chapter: { include: { course: true } },
      lesson: { include: { chapter: { include: { course: true } } } },
      section: { include: { lesson: { include: { chapter: { include: { course: true } } } } } },
    };
  }

  /** Published questions whose placements intersect any of the given scopes.
   * When `studentIdForEntitlement` is set, also requires the requesting student's
   * own entitlement on each matched placement and their own grade to match
   * (mirrors LearningService.practiceQuestions). Admin generation omits both. */
  private async eligibleQuestions(scopes: ScopeRow[], studentIdForEntitlement?: string, gradeId?: string) {
    const questions = await this.prisma.question.findMany({
      where: {
        status: QuestionStatus.PUBLISHED,
        bank: { status: ContentStatus.PUBLISHED },
        source: { status: ContentStatus.PUBLISHED },
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
        options: { orderBy: { sortOrder: 'asc' } },
        placements: { include: this.questionPlacementInclude() },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    const eligible: any[] = [];
    for (const question of questions) {
      const matching = question.placements
        .filter((p: any) => scopes.some((s) => this.placementInScope(p, s)))
        .filter((p: any) => this.placementPublished(this.placementNodes(p)));
      if (!matching.length) continue;
      if (studentIdForEntitlement && !(await this.questionAccessible(studentIdForEntitlement, matching))) continue;
      eligible.push(question);
    }
    return eligible;
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
        publishedAt: params.status === AssessmentStatus.READY ? new Date() : null,
        scopes: { create: params.scopes },
      },
    });
    for (let i = 0; i < params.questions.length; i++) {
      const question = params.questions[i];
      await tx.assessmentQuestion.create({
        data: {
          assessmentId: assessment.id,
          sourceQuestionId: question.id,
          sortOrder: i + 1,
          type: question.type,
          body: question.body,
          explanation: question.explanation,
          options: {
            create: question.options.map((option: any, index: number) => ({
              body: option.body,
              isCorrect: option.isCorrect,
              sortOrder: index + 1,
            })),
          },
        },
      });
    }
    return assessment;
  }

  // --- Student: generation ------------------------------------------------

  async generateStandard(studentId: string, dto: GenerateStandardAssessmentDto) {
    const gradeId = await this.studentGrade(studentId);
    if (dto.isTimed && !dto.durationSeconds) throw new BadRequestException('durationSeconds is required when isTimed is true');
    const scopes = await this.resolveScopes(dto.scopes);
    const eligible = await this.eligibleQuestions(scopes, studentId, gradeId);
    if (eligible.length < dto.questionCount) throw new BadRequestException('Not enough eligible questions in the selected scope');
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
        scopes,
        questions: selected,
      }),
    );
    return this.get(studentId, assessment.id);
  }

  // --- Student: list/get ----------------------------------------------

  private listItemDto(assessment: any, visibility: 'MINE' | 'PUBLIC', attempt?: any) {
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
      score: attempt?.status === AssessmentAttemptStatus.COMPLETED ? attempt.score : null,
    };
  }

  private scopeNodes(scope: any): any[] {
    if (scope.section) return [scope.section, scope.section.lesson, scope.section.lesson.chapter, scope.section.lesson.chapter.course];
    if (scope.lesson) return [scope.lesson, scope.lesson.chapter, scope.lesson.chapter.course];
    if (scope.chapter) return [scope.chapter, scope.chapter.course];
    return [scope.course];
  }

  /** Whether an ADMIN-owned, READY assessment is visible/attemptable by this
   * student: EVERY one of its scopes must have full published ancestry, match
   * the student's grade, and grant effective access (PUBLIC/FREE or an active
   * entitlement on the course or an ancestor chapter) — the frozen snapshot is
   * the UNION of all scopes' questions, so any per-scope failure must hide the
   * whole assessment (fail closed), not just that one scope. */
  private async assessmentVisible(studentId: string, gradeId: string | null, scopes: any[]) {
    if (!scopes.length) return false;
    for (const scope of scopes) {
      const nodes = this.scopeNodes(scope);
      if (nodes.some((node) => node.status !== ContentStatus.PUBLISHED)) return false;
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
    const first = await searchArabicOffsetPage(this.prisma, 'assessment', query, {
      scope,
      orderBy: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      page: 1,
      limit: ASSESSMENT_SEARCH_BATCH_SIZE,
    });
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
    const gradeId = await this.prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { academicGradeId: true } }).then((x) => x?.academicGradeId ?? null);
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
          where: { ownerType: AssessmentOwnerType.ADMIN, status: AssessmentStatus.READY },
          include: { scopes: { include: scopeInclude } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
    const visibility = await Promise.all(adminCandidates.map((assessment) => this.assessmentVisible(studentId, gradeId, assessment.scopes)));
    const visiblePublic = adminCandidates.filter((_, index) => visibility[index]);
    const ids = [...own.map((x) => x.id), ...visiblePublic.map((x) => x.id)];
    const attempts = await this.prisma.assessmentAttempt.findMany({ where: { studentUserId: studentId, assessmentId: { in: ids } } });
    const byAssessment = new Map(attempts.map((a) => [a.assessmentId, a]));
    let merged = [
      ...own.map((x) => ({ assessment: x, visibility: 'MINE' as const })),
      ...visiblePublic.map((x) => ({ assessment: x, visibility: 'PUBLIC' as const })),
    ];
    if (query.status && query.status !== 'ALL')
      merged = merged.filter((x) => byAssessment.get(x.assessment.id)?.status === query.status);
    merged.sort((a, b) => b.assessment.createdAt.getTime() - a.assessment.createdAt.getTime());
    const start = (query.page - 1) * query.limit;
    return {
      data: merged.slice(start, start + query.limit).map((x) => this.listItemDto(x.assessment, x.visibility, byAssessment.get(x.assessment.id))),
      meta: toPaginationMeta(query.page, query.limit, merged.length),
    };
  }

  private async assessmentWithScopes(id: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id }, include: { scopes: { include: scopeInclude } } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  private async assertViewable(studentId: string, assessment: any): Promise<'MINE' | 'PUBLIC'> {
    if (assessment.ownerType === AssessmentOwnerType.STUDENT) {
      if (assessment.studentUserId !== studentId) throw new ForbiddenException('Assessment is not accessible');
      return 'MINE';
    }
    if (assessment.status !== AssessmentStatus.READY) throw new ForbiddenException('Assessment is not accessible');
    const gradeId = await this.prisma.studentProfile.findUnique({ where: { userId: studentId }, select: { academicGradeId: true } }).then((x) => x?.academicGradeId ?? null);
    if (!(await this.assessmentVisible(studentId, gradeId, assessment.scopes))) throw new ForbiddenException('Assessment is not accessible');
    return 'PUBLIC';
  }

  async get(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    const visibility = await this.assertViewable(studentId, assessment);
    const attempt = await this.prisma.assessmentAttempt.findUnique({ where: { assessmentId_studentUserId: { assessmentId: id, studentUserId: studentId } } });
    return {
      ...this.listItemDto(assessment, visibility, attempt),
      scopes: assessment.scopes.map((s: any) => ({ courseId: s.courseId, chapterId: s.chapterId, lessonId: s.lessonId, sectionId: s.sectionId })),
    };
  }

  async rename(studentId: string, id: string, dto: RenameAssessmentDto) {
    const assessment = await this.assessmentWithScopes(id);
    if (assessment.ownerType !== AssessmentOwnerType.STUDENT || assessment.studentUserId !== studentId) throw new ForbiddenException('Assessment is not accessible');
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('title must not be blank');
    await this.prisma.assessment.update({ where: { id }, data: { title } });
    return this.get(studentId, id);
  }

  async remove(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    if (assessment.ownerType !== AssessmentOwnerType.STUDENT || assessment.studentUserId !== studentId) throw new ForbiddenException('Assessment is not accessible');
    await this.prisma.assessment.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- Student: attempt lifecycle ---------------------------------------

  private async questionsForAssessment(id: string) {
    return this.prisma.assessmentQuestion.findMany({ where: { assessmentId: id }, include: { options: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } });
  }

  async startAttempt(studentId: string, id: string) {
    const assessment = await this.assessmentWithScopes(id);
    const existing = await this.prisma.assessmentAttempt.findUnique({ where: { assessmentId_studentUserId: { assessmentId: id, studentUserId: studentId } } });
    if (existing) return this.attemptStateDto(await this.ensureNotExpired(existing), assessment);
    await this.assertViewable(studentId, assessment);
    if (assessment.status !== AssessmentStatus.READY) throw new ConflictException('Assessment is not available to attempt');
    const now = new Date();
    const attempt = await this.createAttempt(id, studentId, assessment, now);
    return this.attemptStateDto(attempt, assessment);
  }

  /** Guards against two concurrent start requests both passing the `existing`
   * check above and racing to create — the loser hits the unique constraint
   * on (assessmentId, studentUserId) and resumes the winner's attempt instead
   * of surfacing an unhandled 500. */
  private async createAttempt(assessmentId: string, studentId: string, assessment: any, now: Date) {
    try {
      return await this.prisma.assessmentAttempt.create({
        data: {
          assessmentId,
          studentUserId: studentId,
          startedAt: now,
          lastActivityAt: now,
          expiresAt: assessment.isTimed && assessment.durationSeconds ? new Date(now.getTime() + assessment.durationSeconds * 1000) : null,
          totalQuestions: assessment.questionCount,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.ensureNotExpired(await this.ownAttempt(studentId, assessmentId));
      }
      throw error;
    }
  }

  private async ownAttempt(studentId: string, id: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({ where: { assessmentId_studentUserId: { assessmentId: id, studentUserId: studentId } } });
    if (!attempt) throw new NotFoundException('No attempt has been started for this assessment');
    return attempt;
  }

  /** Lighter than assessmentWithScopes: used once an attempt already exists,
   * where the (assessmentId, studentUserId) attempt row is itself the proof
   * of access — this keeps a completed/in-progress attempt's state and result
   * readable even after an admin archives the assessment. */
  private async assessmentOrNotFound(id: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id } });
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
        data: { status: AssessmentAttemptStatus.COMPLETED, submittedAt: new Date() },
      });
      if (gate.count === 0) return tx.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      const answers = await tx.assessmentAttemptAnswer.findMany({ where: { attemptId } });
      const score = answers.filter((a) => a.isCorrect).length;
      return tx.assessmentAttempt.update({ where: { id: attemptId }, data: { score } });
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
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({ where: { attemptId: current.id } });
    const byQuestion = new Map(answers.map((a) => [a.assessmentQuestionId, a]));
    const revealAnswers = current.status === AssessmentAttemptStatus.COMPLETED;
    return {
      attemptId: current.id,
      status: current.status,
      startedAt: current.startedAt,
      expiresAt: current.expiresAt,
      submittedAt: current.submittedAt,
      score: current.status === AssessmentAttemptStatus.COMPLETED ? current.score : null,
      totalQuestions: current.totalQuestions,
      mode: assessment.mode,
      questions: questions.map((q) => {
        const answer = byQuestion.get(q.id);
        const showAnswer = revealAnswers || (assessment.mode === AssessmentMode.TUTOR && Boolean(answer));
        return {
          id: q.id,
          sortOrder: q.sortOrder,
          type: q.type,
          body: q.body,
          options: q.options.map((o) => ({ id: o.id, body: o.body, sortOrder: o.sortOrder })),
          selectedOptionIds: answer?.selectedOptionIds ?? [],
          answered: Boolean(answer && answer.selectedOptionIds.length),
          isCorrect: showAnswer ? (answer?.isCorrect ?? false) : null,
          correctOptionIds: showAnswer ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : null,
          explanation: showAnswer ? q.explanation : null,
        };
      }),
    };
  }

  async currentAttemptState(studentId: string, id: string) {
    const assessment = await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    return this.attemptStateDto(attempt, assessment);
  }

  async autosaveAnswer(studentId: string, id: string, assessmentQuestionId: string, dto: AutosaveAnswerDto) {
    const assessment = await this.assessmentOrNotFound(id);
    const attempt = await this.ensureNotExpired(await this.ownAttempt(studentId, id));
    if (attempt.status !== AssessmentAttemptStatus.SUSPENDED) throw new ConflictException('Attempt is no longer in progress');
    if (new Set(dto.selectedOptionIds).size !== dto.selectedOptionIds.length) throw new BadRequestException('selectedOptionIds must not contain duplicates');
    const question = await this.prisma.assessmentQuestion.findFirst({ where: { id: assessmentQuestionId, assessmentId: id }, include: { options: true } });
    if (!question) throw new NotFoundException('Assessment question not found');
    if (!dto.selectedOptionIds.every((optionId) => question.options.some((o) => o.id === optionId))) throw new BadRequestException('Selected options do not belong to the question');
    if (question.type === QuestionType.SINGLE_CHOICE && dto.selectedOptionIds.length > 1) throw new BadRequestException('Single-choice questions accept at most one option');
    const correct = question.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
    const selected = [...dto.selectedOptionIds].sort();
    const isCorrect = selected.length > 0 && correct.length === selected.length && correct.every((id, index) => id === selected[index]);
    await this.prisma.$transaction(async (tx) => {
      const gate = await tx.assessmentAttempt.updateMany({
        where: { id: attempt.id, status: AssessmentAttemptStatus.SUSPENDED },
        data: { lastActivityAt: new Date() },
      });
      if (gate.count === 0) throw new ConflictException('Attempt is no longer in progress');
      await tx.assessmentAttemptAnswer.upsert({
        where: { attemptId_assessmentQuestionId: { attemptId: attempt.id, assessmentQuestionId } },
        create: { attemptId: attempt.id, assessmentQuestionId, selectedOptionIds: dto.selectedOptionIds, isCorrect },
        update: { selectedOptionIds: dto.selectedOptionIds, isCorrect },
      });
    });
    return {
      assessmentQuestionId,
      selectedOptionIds: dto.selectedOptionIds,
      isCorrect: assessment.mode === AssessmentMode.TUTOR ? isCorrect : null,
      correctOptionIds: assessment.mode === AssessmentMode.TUTOR ? correct : null,
      explanation: assessment.mode === AssessmentMode.TUTOR ? question.explanation : null,
    };
  }

  async submitAttempt(studentId: string, id: string) {
    await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    const final = attempt.status === AssessmentAttemptStatus.COMPLETED ? attempt : await this.finalizeAttempt(attempt.id);
    return { attemptId: final.id, status: final.status, score: final.score, totalQuestions: final.totalQuestions, submittedAt: final.submittedAt };
  }

  async result(studentId: string, id: string) {
    await this.assessmentOrNotFound(id);
    const attempt = await this.ownAttempt(studentId, id);
    if (attempt.status !== AssessmentAttemptStatus.COMPLETED) throw new ConflictException('Attempt has not been submitted yet');
    const questions = await this.questionsForAssessment(id);
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const byQuestion = new Map(answers.map((a) => [a.assessmentQuestionId, a]));
    return {
      attemptId: attempt.id,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      submittedAt: attempt.submittedAt,
      questions: questions.map((q) => {
        const answer = byQuestion.get(q.id);
        return {
          id: q.id,
          sortOrder: q.sortOrder,
          type: q.type,
          body: q.body,
          explanation: q.explanation,
          options: q.options.map((o) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect })),
          selectedOptionIds: answer?.selectedOptionIds ?? [],
          isCorrect: answer?.isCorrect ?? false,
          answered: Boolean(answer && answer.selectedOptionIds.length),
        };
      }),
    };
  }

  // --- Admin ---------------------------------------------------------------

  private async log(actor: RequestUser, action: string, targetId: string, metadata?: object) {
    await this.audit.record({ actorUserId: actor.id, action, targetType: 'Assessment', targetId, metadata });
  }

  async createStandard(actor: RequestUser, dto: GenerateStandardAssessmentDto) {
    this.assertAdmin(actor);
    if (dto.isTimed && !dto.durationSeconds) throw new BadRequestException('durationSeconds is required when isTimed is true');
    const scopes = await this.resolveScopes(dto.scopes);
    const eligible = await this.eligibleQuestions(scopes);
    if (eligible.length < dto.questionCount) throw new BadRequestException('Not enough eligible questions in the selected scope');
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
    await this.log(actor, 'ASSESSMENT_CREATED', assessment.id, { generationType: 'STANDARD' });
    return this.getAdmin(actor, assessment.id);
  }

  async createCustom(actor: RequestUser, dto: CreateCustomAssessmentDto) {
    this.assertAdmin(actor);
    if (dto.isTimed && !dto.durationSeconds) throw new BadRequestException('durationSeconds is required when isTimed is true');
    if (new Set(dto.questionIds).size !== dto.questionIds.length) throw new BadRequestException('questionIds must not contain duplicates');
    const scopes = await this.resolveScopes(dto.scopes);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: dto.questionIds }, status: QuestionStatus.PUBLISHED },
      include: { options: { orderBy: { sortOrder: 'asc' } }, placements: { include: this.questionPlacementInclude() } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const ordered = dto.questionIds.map((id) => byId.get(id));
    if (ordered.some((q) => !q)) throw new BadRequestException('One or more questionIds are invalid or not published');
    if (
      ordered.some(
        (q) =>
          !q!.placements.some(
            (p: any) => scopes.some((s) => this.placementInScope(p, s)) && this.placementPublished(this.placementNodes(p)),
          ),
      )
    )
      throw new BadRequestException('Every question must have a published placement within one of the given scopes');
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
    await this.log(actor, 'ASSESSMENT_CREATED', assessment.id, { generationType: 'CUSTOM' });
    return this.getAdmin(actor, assessment.id);
  }

  async listAdmin(actor: RequestUser, query: QueryAdminAssessmentDto) {
    this.assertAdmin(actor);
    const searchQuery = resolveSearchQuery(query);
    const where = { ownerType: AssessmentOwnerType.ADMIN, status: query.status };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.assessment,
      target: 'assessment',
      q: searchQuery,
      scope: {
        where: sqlAnd(
          Prisma.sql`t."ownerType" = ${AssessmentOwnerType.ADMIN}::"AssessmentOwnerType"`,
          query.status ? Prisma.sql`t.status = ${query.status}::"AssessmentStatus"` : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id DESC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      where,
      page: query.page,
      limit: query.limit,
    });
    return { data: data.map((x: any) => this.adminListItemDto(x)), meta: toPaginationMeta(query.page, query.limit, total) };
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
      include: { scopes: true, questions: { include: { options: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!assessment || assessment.ownerType !== AssessmentOwnerType.ADMIN) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  async getAdmin(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    return {
      ...this.adminListItemDto(assessment),
      scopes: assessment.scopes.map((s: any) => ({ courseId: s.courseId, chapterId: s.chapterId, lessonId: s.lessonId, sectionId: s.sectionId })),
      questions: assessment.questions.map((q: any) => ({
        id: q.id,
        sortOrder: q.sortOrder,
        type: q.type,
        body: q.body,
        explanation: q.explanation,
        options: q.options.map((o: any) => ({ id: o.id, body: o.body, isCorrect: o.isCorrect, sortOrder: o.sortOrder })),
      })),
    };
  }

  async updateAdmin(actor: RequestUser, id: string, dto: UpdateAdminAssessmentDto) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT) throw new ConflictException('Only draft assessments can be updated');
    if ((dto.isTimed ?? assessment.isTimed) && !(dto.durationSeconds ?? assessment.durationSeconds)) throw new BadRequestException('durationSeconds is required when isTimed is true');
    let title: string | undefined;
    if (dto.title !== undefined) {
      title = dto.title.trim();
      if (!title) throw new BadRequestException('title must not be blank');
    }
    await this.prisma.assessment.update({ where: { id }, data: { title, mode: dto.mode, isTimed: dto.isTimed, durationSeconds: dto.durationSeconds } });
    await this.log(actor, 'ASSESSMENT_UPDATED', id);
    return this.getAdmin(actor, id);
  }

  async publish(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT) throw new ConflictException('Only draft assessments can be published');
    await this.prisma.assessment.update({ where: { id }, data: { status: AssessmentStatus.READY, publishedAt: new Date() } });
    await this.log(actor, 'ASSESSMENT_PUBLISHED', id);
    return this.getAdmin(actor, id);
  }

  async archive(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.READY) throw new ConflictException('Only published assessments can be archived');
    await this.prisma.assessment.update({ where: { id }, data: { status: AssessmentStatus.ARCHIVED, archivedAt: new Date() } });
    await this.log(actor, 'ASSESSMENT_ARCHIVED', id);
    return this.getAdmin(actor, id);
  }

  async deleteAdmin(actor: RequestUser, id: string) {
    this.assertAdmin(actor);
    const assessment = await this.adminAssessment(id);
    if (assessment.status !== AssessmentStatus.DRAFT) throw new ConflictException('Only a never-published draft assessment can be deleted');
    await this.prisma.assessment.delete({ where: { id } });
    await this.log(actor, 'ASSESSMENT_DELETED', id);
    return { id, deleted: true };
  }
}
