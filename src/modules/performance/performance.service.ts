import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssessmentAttemptStatus,
  AssessmentQuestionOutcome,
  ContentStatus,
  QuestionStatus,
  Role,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import { normalizeArabic } from '../../common/search/arabic-search';
import type { RequestParentSession } from '../../common/types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import type {
  PerformanceAnalysisQueryDto,
  PerformanceAnswerChangesQueryDto,
  PerformanceInsightsQueryDto,
  PerformancePeersQueryDto,
  PerformancePeriodQueryDto,
  PerformanceScopeQueryDto,
  PerformanceTrendQueryDto,
} from './performance.dto';

type Outcome = 'CORRECT' | 'INCORRECT' | 'OMITTED';
type Source = 'ASSESSMENT' | 'PRACTICE';
type Level = 'subject' | 'course' | 'chapter' | 'lesson' | 'section';
type Placement = {
  subjectId: string;
  subjectTitle: string;
  courseId: string;
  courseTitle: string;
  chapterId: string | null;
  chapterTitle: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
};
type Activity = {
  id: string;
  source: Source;
  questionId: string;
  outcome: Outcome;
  submittedAt: Date;
  placements: Placement[];
};
type Metrics = {
  total: number;
  correct: number;
  incorrect: number;
  omitted: number;
  answered: number;
  accuracyPercent: number;
};

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ContentAccessPolicyService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private dates(query: PerformancePeriodQueryDto) {
    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
    return {
      from,
      to,
      submittedAt:
        from || to
          ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
          : undefined,
    };
  }
  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  private outcome(answer: {
    outcome: AssessmentQuestionOutcome | null;
    isCorrect?: boolean | null;
    selectedOptionIds?: string[];
  }): Outcome {
    if (answer.outcome === AssessmentQuestionOutcome.CORRECT) return 'CORRECT';
    if (answer.outcome === AssessmentQuestionOutcome.INCORRECT)
      return 'INCORRECT';
    if (answer.outcome === AssessmentQuestionOutcome.OMITTED) return 'OMITTED';
    return answer.selectedOptionIds?.length
      ? answer.isCorrect
        ? 'CORRECT'
        : 'INCORRECT'
      : 'OMITTED';
  }
  private scopeWhere(query: PerformanceScopeQueryDto) {
    return {
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.lessonId ? { lessonId: query.lessonId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
    };
  }
  private matchesScope(p: Placement, query: PerformanceScopeQueryDto) {
    return (
      (!query.subjectId || p.subjectId === query.subjectId) &&
      (!query.courseId || p.courseId === query.courseId) &&
      (!query.chapterId || p.chapterId === query.chapterId) &&
      (!query.lessonId || p.lessonId === query.lessonId) &&
      (!query.sectionId || p.sectionId === query.sectionId)
    );
  }

  /** Published questions the student can currently access. */
  private async eligibleQuestionIds(studentId: string, courseId?: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { academicGradeId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const questions = await this.prisma.question.findMany({
      where: {
        status: QuestionStatus.PUBLISHED,
        ...(courseId ? { courseId } : {}),
        bank: { status: ContentStatus.PUBLISHED },
        source: { status: ContentStatus.PUBLISHED },
        course: {
          status: ContentStatus.PUBLISHED,
          subject: {
            status: ContentStatus.PUBLISHED,
            academicGradeId: student.academicGradeId ?? '__missing__',
            academicGrade: { status: ContentStatus.PUBLISHED },
          },
        },
      },
      include: {
        placements: {
          include: {
            course: true,
            chapter: { include: { course: true } },
            lesson: { include: { chapter: { include: { course: true } } } },
            section: {
              include: {
                lesson: { include: { chapter: { include: { course: true } } } },
              },
            },
          },
        },
      },
    });
    const ids: string[] = [];
    for (const question of questions)
      for (const placement of question.placements) {
        const nodes = placement.section
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
              : placement.course
                ? [placement.course]
                : [];
        if (
          nodes.length &&
          (await this.access.entitledForNodes(studentId, nodes))
        ) {
          ids.push(question.id);
          break;
        }
      }
    return ids;
  }

  private directPlacement(placement: any): Placement | null {
    const section = placement.section,
      lesson = placement.lesson ?? section?.lesson,
      chapter = placement.chapter ?? lesson?.chapter,
      course = placement.course ?? chapter?.course,
      subject = course?.subject;
    if (!course || !subject) return null;
    return {
      subjectId: subject.id,
      subjectTitle: subject.title,
      courseId: course.id,
      courseTitle: course.title,
      chapterId: chapter?.id ?? null,
      chapterTitle: chapter?.title ?? null,
      lessonId: lesson?.id ?? null,
      lessonTitle: lesson?.title ?? null,
      sectionId: section?.id ?? null,
      sectionTitle: section?.title ?? null,
    };
  }
  private snapshotPlacement(p: any): Placement {
    return {
      subjectId: p.subjectId,
      subjectTitle: p.subjectTitle,
      courseId: p.courseId,
      courseTitle: p.courseTitle,
      chapterId: p.chapterId,
      chapterTitle: p.chapterTitle,
      lessonId: p.lessonId,
      lessonTitle: p.lessonTitle,
      sectionId: p.sectionId,
      sectionTitle: p.sectionTitle,
    };
  }
  private uniquePlacements(placements: Placement[]) {
    return [
      ...new Map(
        placements.map((p) => [
          `${p.subjectId}:${p.courseId}:${p.chapterId ?? ''}:${p.lessonId ?? ''}:${p.sectionId ?? ''}`,
          p,
        ]),
      ).values(),
    ];
  }

  private async dataset(studentId: string, query: PerformanceScopeQueryDto) {
    const date = this.dates(query),
      eligibleIds = await this.eligibleQuestionIds(studentId, query.courseId);
    if (!eligibleIds.length)
      return { eligibleIds, activities: [] as Activity[] };
    const placementWhere = this.scopeWhere(query);
    const [assessmentAnswers, practiceAttempts] = await Promise.all([
      this.prisma.assessmentAttemptAnswer.findMany({
        where: {
          attempt: {
            studentUserId: studentId,
            status: AssessmentAttemptStatus.COMPLETED,
            ...(date.submittedAt ? { submittedAt: date.submittedAt } : {}),
          },
          assessmentQuestion: {
            sourceQuestionId: { in: eligibleIds },
            placements: { some: placementWhere },
          },
        },
        select: {
          id: true,
          outcome: true,
          isCorrect: true,
          selectedOptionIds: true,
          attempt: { select: { submittedAt: true } },
          assessmentQuestion: {
            select: { sourceQuestionId: true, placements: true },
          },
        },
      }),
      this.prisma.studentQuestionAttempt.findMany({
        where: {
          studentUserId: studentId,
          questionId: { in: eligibleIds },
          ...(date.submittedAt ? { submittedAt: date.submittedAt } : {}),
        },
        select: {
          id: true,
          questionId: true,
          isCorrect: true,
          submittedAt: true,
          question: {
            select: {
              placements: {
                include: {
                  course: { include: { subject: true } },
                  chapter: {
                    include: { course: { include: { subject: true } } },
                  },
                  lesson: {
                    include: {
                      chapter: {
                        include: { course: { include: { subject: true } } },
                      },
                    },
                  },
                  section: {
                    include: {
                      lesson: {
                        include: {
                          chapter: {
                            include: { course: { include: { subject: true } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    const assessments: Activity[] = assessmentAnswers.map((answer) => ({
      id: `ASSESSMENT:${answer.id}`,
      source: 'ASSESSMENT',
      questionId: answer.assessmentQuestion.sourceQuestionId,
      outcome: this.outcome(answer),
      submittedAt: answer.attempt.submittedAt!,
      placements: this.uniquePlacements(
        answer.assessmentQuestion.placements
          .map((p) => this.snapshotPlacement(p))
          .filter((p) => this.matchesScope(p, query)),
      ),
    }));
    const practice: Activity[] = practiceAttempts.map((attempt) => ({
      id: `PRACTICE:${attempt.id}`,
      source: 'PRACTICE',
      questionId: attempt.questionId,
      outcome: attempt.isCorrect ? 'CORRECT' : 'INCORRECT',
      submittedAt: attempt.submittedAt,
      placements: this.uniquePlacements(
        attempt.question.placements
          .map((p) => this.directPlacement(p))
          .filter((p): p is Placement => Boolean(p))
          .filter((p) => this.matchesScope(p, query)),
      ),
    }));
    return {
      eligibleIds,
      activities: [...assessments, ...practice]
        .filter((a) => a.placements.length)
        .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()),
    };
  }

  private metrics(activities: Activity[]): Metrics {
    const correct = activities.filter((a) => a.outcome === 'CORRECT').length,
      incorrect = activities.filter((a) => a.outcome === 'INCORRECT').length,
      omitted = activities.filter((a) => a.outcome === 'OMITTED').length,
      answered = correct + incorrect;
    return {
      total: activities.length,
      correct,
      incorrect,
      omitted,
      answered,
      accuracyPercent: answered ? this.round((correct / answered) * 100) : 0,
    };
  }
  private sourceBreakdown(activities: Activity[]) {
    return {
      assessment: this.metrics(
        activities.filter((a) => a.source === 'ASSESSMENT'),
      ),
      practice: this.metrics(activities.filter((a) => a.source === 'PRACTICE')),
    };
  }
  private levelValue(p: Placement, level: Level) {
    if (level === 'subject') return { id: p.subjectId, title: p.subjectTitle };
    if (level === 'course') return { id: p.courseId, title: p.courseTitle };
    if (level === 'chapter')
      return p.chapterId ? { id: p.chapterId, title: p.chapterTitle! } : null;
    if (level === 'lesson')
      return p.lessonId ? { id: p.lessonId, title: p.lessonTitle! } : null;
    return p.sectionId ? { id: p.sectionId, title: p.sectionTitle! } : null;
  }
  private groups(activities: Activity[], level: Level) {
    const groups = new Map<
      string,
      { id: string; title: string; activities: Activity[]; seen: Set<string> }
    >();
    for (const activity of activities)
      for (const placement of activity.placements) {
        const target = this.levelValue(placement, level);
        if (!target) continue;
        const row = groups.get(target.id) ?? {
          ...target,
          activities: [],
          seen: new Set<string>(),
        };
        if (!row.seen.has(activity.id)) {
          row.seen.add(activity.id);
          row.activities.push(activity);
        }
        groups.set(target.id, row);
      }
    return [...groups.values()].map((row) => ({
      id: row.id,
      title: row.title,
      ...this.metrics(row.activities),
      sources: this.sourceBreakdown(row.activities),
    }));
  }

  async overview(studentId: string, query: PerformancePeriodQueryDto) {
    const { eligibleIds, activities } = await this.dataset(studentId, query),
      used = new Set(activities.map((a) => a.questionId));
    return {
      period: { from: query.from ?? null, to: query.to ?? null },
      ...this.metrics(activities),
      uniqueQuestionsAttempted: used.size,
      questionBank: {
        eligible: eligibleIds.length,
        used: used.size,
        unused: Math.max(0, eligibleIds.length - used.size),
        usagePercent: eligibleIds.length
          ? this.round((used.size / eligibleIds.length) * 100)
          : 0,
      },
      sources: this.sourceBreakdown(activities),
      lastActivityAt: activities.at(-1)?.submittedAt ?? null,
    };
  }

  async analysis(studentId: string, query: PerformanceAnalysisQueryDto) {
    const { activities } = await this.dataset(studentId, query),
      normalized = query.q ? normalizeArabic(query.q) : '';
    const data = this.groups(activities, query.level)
      .filter(
        (group) =>
          !normalized || normalizeArabic(group.title).includes(normalized),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
    return {
      level: query.level,
      data: data.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      meta: toPaginationMeta(query.page, query.limit, data.length),
    };
  }

  private trendClassification(activities: Activity[]) {
    const now = new Date(),
      recentStart = new Date(now);
    recentStart.setUTCDate(recentStart.getUTCDate() - 28);
    const previousStart = new Date(recentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - 28);
    const recent = this.metrics(
        activities.filter(
          (a) => a.submittedAt >= recentStart && a.submittedAt <= now,
        ),
      ),
      previous = this.metrics(
        activities.filter(
          (a) => a.submittedAt >= previousStart && a.submittedAt < recentStart,
        ),
      );
    if (recent.answered < 10 || previous.answered < 10)
      return {
        status: 'INSUFFICIENT_DATA',
        recent,
        previous,
        changePoints: null,
      };
    const changePoints = this.round(
      recent.accuracyPercent - previous.accuracyPercent,
    );
    return {
      status:
        changePoints >= 5
          ? 'IMPROVING'
          : changePoints <= -5
            ? 'DECLINING'
            : 'STABLE',
      recent,
      previous,
      changePoints,
    };
  }
  async trends(studentId: string, query: PerformanceTrendQueryDto) {
    const { activities } = await this.dataset(studentId, query),
      days = new Map<string, Activity[]>();
    for (const activity of activities) {
      const day = activity.submittedAt.toISOString().slice(0, 10);
      days.set(day, [...(days.get(day) ?? []), activity]);
    }
    return {
      data: [...days.entries()].map(([date, value]) => ({
        date,
        ...this.metrics(value),
        sources: this.sourceBreakdown(value),
      })),
      trend: this.trendClassification(activities),
    };
  }

  private insightGroups(activities: Activity[]) {
    const rows = new Map<
      string,
      {
        id: string;
        title: string;
        level: 'section' | 'lesson' | 'chapter';
        activities: Activity[];
        seen: Set<string>;
      }
    >();
    for (const activity of activities)
      for (const p of activity.placements) {
        const target = p.sectionId
          ? {
              id: p.sectionId,
              title: p.sectionTitle!,
              level: 'section' as const,
            }
          : p.lessonId
            ? {
                id: p.lessonId,
                title: p.lessonTitle!,
                level: 'lesson' as const,
              }
            : p.chapterId
              ? {
                  id: p.chapterId,
                  title: p.chapterTitle!,
                  level: 'chapter' as const,
                }
              : null;
        if (!target) continue;
        const row = rows.get(`${target.level}:${target.id}`) ?? {
          ...target,
          activities: [],
          seen: new Set<string>(),
        };
        if (!row.seen.has(activity.id)) {
          row.seen.add(activity.id);
          row.activities.push(activity);
        }
        rows.set(`${target.level}:${target.id}`, row);
      }
    return [...rows.values()].map((row) => ({
      ...row,
      ...this.metrics(row.activities),
    }));
  }
  async insights(studentId: string, query: PerformanceInsightsQueryDto) {
    const { activities } = await this.dataset(studentId, query),
      minimum = 10,
      allScopes = this.insightGroups(activities),
      scopes = allScopes.filter((scope) => scope.answered >= minimum);
    const decorate = (
      scope: (typeof allScopes)[number],
      recommendation: string,
    ) => ({
      id: scope.id,
      title: scope.title,
      level: scope.level,
      ...this.metrics(scope.activities),
      recommendation,
    });
    const strengths = scopes
      .filter((s) => s.accuracyPercent >= 80)
      .sort(
        (a, b) =>
          b.accuracyPercent - a.accuracyPercent || b.answered - a.answered,
      )
      .slice(0, 3)
      .map((s) => decorate(s, 'MAINTAIN_STRENGTH'));
    const weaknesses = scopes
      .filter((s) => s.accuracyPercent < 60)
      .sort(
        (a, b) =>
          a.accuracyPercent - b.accuracyPercent || b.answered - a.answered,
      )
      .slice(0, 3)
      .map((s) => decorate(s, 'REVIEW_TOPIC'));
    const limitedPractice = allScopes
      .filter((s) => s.answered > 0 && s.answered < minimum)
      .sort((a, b) => a.answered - b.answered)
      .slice(0, 3)
      .map((s) => decorate(s, 'PRACTICE_MORE'));
    const omissions = allScopes
      .filter((s) => s.omitted > 0)
      .sort(
        (a, b) =>
          b.omitted - a.omitted || a.accuracyPercent - b.accuracyPercent,
      )
      .slice(0, 3)
      .map((s) => decorate(s, 'COMPLETE_SKIPPED'));
    const byQuestion = new Map<string, Activity[]>();
    for (const a of activities)
      byQuestion.set(a.questionId, [
        ...(byQuestion.get(a.questionId) ?? []),
        a,
      ]);
    const repeatedErrors = [...byQuestion.entries()]
      .map(([questionId, values]) => {
        const sorted = [...values].sort(
          (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime(),
        );
        return {
          questionId,
          incorrectAttempts: sorted.filter((a) => a.outcome === 'INCORRECT')
            .length,
          latestOutcome: sorted.at(-1)?.outcome,
          lastAttemptAt: sorted.at(-1)?.submittedAt ?? null,
        };
      })
      .filter(
        (row) =>
          row.incorrectAttempts >= 3 && row.latestOutcome === 'INCORRECT',
      )
      .sort((a, b) => b.incorrectAttempts - a.incorrectAttempts)
      .slice(0, 3)
      .map((row) => ({ ...row, recommendation: 'RETRY_QUESTION' }));
    const trend = this.trendClassification(activities);
    return {
      status:
        this.metrics(activities).answered >= minimum
          ? 'AVAILABLE'
          : 'INSUFFICIENT_DATA',
      minimumAnsweredAttempts: minimum,
      strengths,
      weaknesses,
      limitedPractice,
      omissions,
      repeatedErrors,
      trend,
      recommendations: [
        ...new Set([
          ...strengths.map((r) => r.recommendation),
          ...weaknesses.map((r) => r.recommendation),
          ...limitedPractice.map((r) => r.recommendation),
          ...omissions.map((r) => r.recommendation),
          ...repeatedErrors.map((r) => r.recommendation),
        ]),
      ],
    };
  }

  async peers(studentId: string, query: PerformancePeersQueryDto) {
    const mine = await this.dataset(studentId, query),
      me = await this.prisma.studentProfile.findUnique({
        where: { userId: studentId },
        select: { academicGradeId: true },
      });
    if (!me?.academicGradeId)
      throw new ConflictException('Student academic grade is required');
    const candidates = await this.prisma.studentProfile.findMany({
      where: {
        academicGradeId: me.academicGradeId,
        user: { role: Role.STUDENT, status: 'ACTIVE', deletedAt: null },
      },
      select: { userId: true },
    });
    const values: { id: string; value: number }[] = [];
    for (const candidate of candidates) {
      const data =
        candidate.userId === studentId
          ? mine
          : await this.dataset(candidate.userId, query);
      const metrics = this.metrics(data.activities);
      if (metrics.answered >= 10)
        values.push({ id: candidate.userId, value: metrics.accuracyPercent });
    }
    const mineValue =
        values.find((value) => value.id === studentId)?.value ?? null,
      peers = values.filter((value) => value.id !== studentId),
      minimum = this.config.get('platformComparisonMinSample', { infer: true });
    const scope = {
      subjectId: query.subjectId,
      courseId: query.courseId,
      chapterId: query.chapterId ?? null,
      lessonId: query.lessonId ?? null,
      sectionId: query.sectionId ?? null,
    };
    if (mineValue === null || peers.length < minimum)
      return {
        status: 'INSUFFICIENT_DATA',
        scope,
        cohort: {
          type: 'GRADE_SHARED_SCOPE',
          sampleSize: peers.length,
          minimumSampleSize: minimum,
          minimumAnsweredAttempts: 10,
        },
        student:
          mineValue === null
            ? null
            : { accuracyPercent: mineValue, percentile: null },
        peers: null,
        distribution: null,
        comparison: null,
      };
    const sorted = peers.map((value) => value.value).sort((a, b) => a - b),
      average =
        sorted.reduce((total, value) => total + value, 0) / sorted.length,
      middle = Math.floor(sorted.length / 2),
      median =
        sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2;
    const buckets = Array.from({ length: 10 }, (_, index) => ({
      from: index * 10,
      to: index === 9 ? 100 : index * 10 + 9,
      count: 0,
    }));
    for (const score of sorted)
      buckets[Math.min(9, Math.floor(score / 10))].count++;
    const percentile = Math.round(
      (sorted.filter((value) => value <= mineValue).length / sorted.length) *
        100,
    );
    return {
      status: 'AVAILABLE',
      scope,
      cohort: {
        type: 'GRADE_SHARED_SCOPE',
        sampleSize: peers.length,
        minimumSampleSize: minimum,
        minimumAnsweredAttempts: 10,
      },
      student: { accuracyPercent: mineValue, percentile },
      peers: {
        averageAccuracyPercent: this.round(average),
        medianAccuracyPercent: this.round(median),
      },
      distribution: {
        bucketSize: 10,
        buckets,
        minAccuracyPercent: sorted[0],
        maxAccuracyPercent: sorted.at(-1),
        averageAccuracyPercent: this.round(average),
        medianAccuracyPercent: this.round(median),
      },
      comparison: {
        studentVsAveragePoints: this.round(mineValue - average),
        studentVsMedianPoints: this.round(mineValue - median),
        percentile,
      },
    };
  }

  async answerChanges(
    studentId: string,
    query: PerformanceAnswerChangesQueryDto,
  ) {
    const date = this.dates(query);
    const changes = await this.prisma.assessmentAnswerChange.findMany({
      where: {
        attemptAnswer: {
          attempt: {
            studentUserId: studentId,
            ...(date.submittedAt ? { startedAt: date.submittedAt } : {}),
          },
          assessmentQuestion: { placements: { some: this.scopeWhere(query) } },
        },
      },
      orderBy: { changedAt: 'desc' },
    });
    const correctToIncorrect = changes.filter(
        (c) => c.fromOutcome === 'CORRECT' && c.toOutcome === 'INCORRECT',
      ).length,
      incorrectToCorrect = changes.filter(
        (c) => c.fromOutcome === 'INCORRECT' && c.toOutcome === 'CORRECT',
      ).length;
    return {
      totalChanges: changes.length,
      correctToIncorrect,
      incorrectToCorrect,
      data: changes.map((c) => ({
        id: c.id,
        fromOutcome: c.fromOutcome,
        toOutcome: c.toOutcome,
        changedAt: c.changedAt,
      })),
    };
  }

  private async parentStudentId(parent: RequestParentSession) {
    if (!parent.activeStudentId)
      throw new ForbiddenException('No child selected');
    const child = await this.prisma.studentProfile.findUnique({
      where: { userId: parent.activeStudentId },
      select: { userId: true, parentPhoneNormalized: true },
    });
    if (!child || child.parentPhoneNormalized !== parent.parentPhoneNormalized)
      throw new ForbiddenException('Student is not linked to this parent');
    return child.userId;
  }
  async parentOverview(
    parent: RequestParentSession,
    query: PerformancePeriodQueryDto,
  ) {
    return this.overview(await this.parentStudentId(parent), query);
  }
  async parentAnalysis(
    parent: RequestParentSession,
    query: PerformanceAnalysisQueryDto,
  ) {
    return this.analysis(await this.parentStudentId(parent), query);
  }
  async parentTrends(
    parent: RequestParentSession,
    query: PerformanceTrendQueryDto,
  ) {
    return this.trends(await this.parentStudentId(parent), query);
  }
  async parentInsights(
    parent: RequestParentSession,
    query: PerformanceInsightsQueryDto,
  ) {
    return this.insights(await this.parentStudentId(parent), query);
  }
}
