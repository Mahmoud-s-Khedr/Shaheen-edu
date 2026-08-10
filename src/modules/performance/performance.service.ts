import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import type {
  PerformanceAnalysisQueryDto,
  PerformanceAnswerChangesQueryDto,
  PerformancePeersQueryDto,
  PerformancePeriodQueryDto,
  PerformanceTrendQueryDto,
} from './performance.dto';

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
  private outcome(answer: any) {
    return (
      answer.outcome ??
      (answer.selectedOptionIds?.length
        ? answer.isCorrect
          ? AssessmentQuestionOutcome.CORRECT
          : AssessmentQuestionOutcome.INCORRECT
        : AssessmentQuestionOutcome.OMITTED)
    );
  }

  private async eligibleQuestions(studentId: string, courseId?: string) {
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
    const eligible: any[] = [];
    for (const question of questions) {
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
              : [placement.course];
        if (await this.access.entitledForNodes(studentId, nodes)) {
          eligible.push(question);
          break;
        }
      }
    }
    return eligible;
  }

  async overview(studentId: string, query: PerformancePeriodQueryDto) {
    const date = this.dates(query);
    const eligible = await this.eligibleQuestions(studentId);
    const eligibleIds = eligible.map((question) => question.id);
    const [assessments, assessmentAnswers, practice] = await Promise.all([
      this.prisma.assessmentAttempt.findMany({
        where: {
          studentUserId: studentId,
          ...(date.submittedAt ? { submittedAt: date.submittedAt } : {}),
        },
        select: { status: true },
      }),
      this.prisma.assessmentAttemptAnswer.findMany({
        where: {
          attempt: {
            studentUserId: studentId,
            status: AssessmentAttemptStatus.COMPLETED,
            ...(date.submittedAt ? { submittedAt: date.submittedAt } : {}),
          },
        },
        select: {
          outcome: true,
          assessmentQuestion: { select: { sourceQuestionId: true } },
        },
      }),
      this.prisma.studentQuestionAttempt.findMany({
        where: {
          studentUserId: studentId,
          questionId: { in: eligibleIds },
          ...(date.from || date.to
            ? {
                submittedAt: {
                  ...(date.from ? { gte: date.from } : {}),
                  ...(date.to ? { lte: date.to } : {}),
                },
              }
            : {}),
        },
        select: { questionId: true, isCorrect: true },
      }),
    ]);
    const correct = assessmentAnswers.filter(
        (a) => a.outcome === AssessmentQuestionOutcome.CORRECT,
      ).length,
      incorrect = assessmentAnswers.filter(
        (a) => a.outcome === AssessmentQuestionOutcome.INCORRECT,
      ).length,
      omitted = assessmentAnswers.filter(
        (a) => a.outcome === AssessmentQuestionOutcome.OMITTED,
      ).length;
    const used = new Set([
      ...practice.map((item) => item.questionId),
      ...assessmentAnswers
        .map((item) => item.assessmentQuestion.sourceQuestionId)
        .filter((id) => eligibleIds.includes(id)),
    ]);
    return {
      period: { from: date.from ?? null, to: date.to ?? null },
      tests: {
        total: assessments.length,
        completed: assessments.filter(
          (a) => a.status === AssessmentAttemptStatus.COMPLETED,
        ).length,
        suspended: assessments.filter(
          (a) => a.status === AssessmentAttemptStatus.SUSPENDED,
        ).length,
      },
      questionBank: {
        eligible: eligibleIds.length,
        used: used.size,
        unused: Math.max(0, eligibleIds.length - used.size),
        usagePercent: eligibleIds.length
          ? this.round((used.size / eligibleIds.length) * 100)
          : 0,
      },
      assessmentScore: {
        total: correct + incorrect + omitted,
        correct,
        incorrect,
        omitted,
        answered: correct + incorrect,
        accuracyPercent:
          correct + incorrect
            ? this.round((correct / (correct + incorrect)) * 100)
            : 0,
      },
      practice: {
        uniqueAttempted: new Set(practice.map((item) => item.questionId)).size,
        totalAttempts: practice.length,
        correctAttempts: practice.filter((item) => item.isCorrect).length,
        accuracyPercent: practice.length
          ? this.round(
              (practice.filter((item) => item.isCorrect).length /
                practice.length) *
                100,
            )
          : 0,
      },
    };
  }

  async analysis(studentId: string, query: PerformanceAnalysisQueryDto) {
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        attempt: {
          studentUserId: studentId,
          status: AssessmentAttemptStatus.COMPLETED,
        },
        assessmentQuestion: {
          placements: {
            some: {
              ...(query.subjectId ? { subjectId: query.subjectId } : {}),
              ...(query.courseId ? { courseId: query.courseId } : {}),
              ...(query.chapterId ? { chapterId: query.chapterId } : {}),
            },
          },
        },
      },
      include: { assessmentQuestion: { include: { placements: true } } },
    });
    const groups = new Map<string, any>();
    const q = query.q ? normalizeArabic(query.q) : '';
    for (const answer of answers)
      for (const placement of answer.assessmentQuestion.placements) {
        if (
          (query.subjectId && placement.subjectId !== query.subjectId) ||
          (query.courseId && placement.courseId !== query.courseId) ||
          (query.chapterId && placement.chapterId !== query.chapterId)
        )
          continue;
        const id =
          query.level === 'subject'
            ? placement.subjectId
            : query.level === 'chapter'
              ? placement.chapterId
              : (placement.sectionId ?? placement.lessonId);
        const title =
          query.level === 'subject'
            ? placement.subjectTitle
            : query.level === 'chapter'
              ? placement.chapterTitle
              : (placement.sectionTitle ?? placement.lessonTitle);
        if (!id || !title) continue;
        const row = groups.get(id) ?? {
          id,
          title,
          subjectId: placement.subjectId,
          courseId: placement.courseId,
          chapterId: placement.chapterId,
          total: 0,
          correct: 0,
          incorrect: 0,
          omitted: 0,
          hasChildren: query.level !== 'lesson',
        };
        row.total++;
        const outcome = this.outcome(answer);
        if (outcome === AssessmentQuestionOutcome.CORRECT) row.correct++;
        else if (outcome === AssessmentQuestionOutcome.INCORRECT)
          row.incorrect++;
        else row.omitted++;
        groups.set(id, row);
      }
    const data = [...groups.values()]
      .filter((row) => !q || normalizeArabic(row.title).includes(q))
      .map((row) => ({
        ...row,
        answered: row.correct + row.incorrect,
        accuracyPercent:
          row.correct + row.incorrect
            ? this.round((row.correct / (row.correct + row.incorrect)) * 100)
            : 0,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    const page = query.page ?? 1,
      limit = query.limit ?? 20;
    return {
      level: query.level,
      data: data.slice((page - 1) * limit, page * limit),
      meta: toPaginationMeta(page, limit, data.length),
    };
  }

  async trends(studentId: string, query: PerformanceTrendQueryDto) {
    const date = this.dates(query);
    const attempts = await this.prisma.assessmentAttempt.findMany({
      where: {
        studentUserId: studentId,
        status: AssessmentAttemptStatus.COMPLETED,
        ...(query.assessmentId ? { assessmentId: query.assessmentId } : {}),
        ...(date.submittedAt ? { submittedAt: date.submittedAt } : {}),
      },
      include: { answers: { select: { outcome: true } } },
      orderBy: { submittedAt: 'asc' },
    });
    const groups = new Map<string, any>();
    for (const attempt of attempts) {
      const key = attempt.submittedAt!.toISOString().slice(0, 10);
      const row = groups.get(key) ?? {
        date: key,
        testsCompleted: 0,
        correct: 0,
        incorrect: 0,
        omitted: 0,
        totalQuestions: 0,
      };
      row.testsCompleted++;
      row.totalQuestions += attempt.totalQuestions;
      for (const a of attempt.answers) {
        if (a.outcome === 'CORRECT') row.correct++;
        else if (a.outcome === 'INCORRECT') row.incorrect++;
        else row.omitted++;
      }
      groups.set(key, row);
    }
    return {
      data: [...groups.values()].map((row) => ({
        ...row,
        accuracyPercent:
          row.correct + row.incorrect
            ? this.round((row.correct / (row.correct + row.incorrect)) * 100)
            : 0,
      })),
    };
  }

  private async scope(studentId: string, courseId: string) {
    const qs = await this.eligibleQuestions(studentId, courseId);
    const chapterIds = new Set<string>();
    let subjectId: string | null = null;
    for (const q of qs)
      for (const p of q.placements) {
        const course =
          p.courseId ??
          p.chapter?.courseId ??
          p.lesson?.chapter?.courseId ??
          p.section?.lesson?.chapter?.courseId;
        if (course !== courseId) continue;
        subjectId = q.courseId
          ? ((
              await this.prisma.course.findUnique({
                where: { id: q.courseId },
                select: { subjectId: true },
              })
            )?.subjectId ?? subjectId)
          : subjectId;
        const chapter =
          p.chapterId ?? p.lesson?.chapterId ?? p.section?.lesson?.chapterId;
        if (chapter) chapterIds.add(chapter);
      }
    return {
      subjectId,
      chapterIds: [...chapterIds].sort(),
      signature: [...chapterIds].sort().join(','),
    };
  }

  async peers(studentId: string, query: PerformancePeersQueryDto) {
    const mine = await this.scope(studentId, query.courseId);
    if (mine.subjectId !== query.subjectId)
      throw new NotFoundException(
        'Selected course is not accessible in the subject',
      );
    const me = await this.prisma.studentProfile.findUnique({
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
    const peerIds: string[] = [];
    for (const candidate of candidates) {
      const scope = await this.scope(candidate.userId, query.courseId);
      if (
        scope.subjectId === query.subjectId &&
        scope.signature === mine.signature
      )
        peerIds.push(candidate.userId);
    }
    const answers = await this.prisma.assessmentAttemptAnswer.findMany({
      where: {
        attempt: {
          studentUserId: { in: peerIds },
          status: AssessmentAttemptStatus.COMPLETED,
        },
        assessmentQuestion: {
          placements: {
            some: {
              subjectId: query.subjectId,
              courseId: query.courseId,
              ...(query.chapterId
                ? { chapterId: query.chapterId }
                : { chapterId: { in: mine.chapterIds } }),
            },
          },
        },
      },
      include: {
        attempt: { select: { studentUserId: true } },
        assessmentQuestion: { select: { placements: true } },
      },
    });
    const scores = new Map<string, { correct: number; answered: number }>();
    for (const answer of answers) {
      const placementMatches = answer.assessmentQuestion.placements.some(
        (p) =>
          p.subjectId === query.subjectId &&
          p.courseId === query.courseId &&
          (query.chapterId
            ? p.chapterId === query.chapterId
            : !!p.chapterId && mine.chapterIds.includes(p.chapterId)),
      );
      if (!placementMatches) continue;
      const row = scores.get(answer.attempt.studentUserId) ?? {
        correct: 0,
        answered: 0,
      };
      if (answer.outcome !== 'OMITTED') {
        row.answered++;
        if (answer.outcome === 'CORRECT') row.correct++;
      }
      scores.set(answer.attempt.studentUserId, row);
    }
    const values = [...scores.entries()]
      .filter(([, row]) => row.answered > 0)
      .map(([id, row]) => ({ id, value: (row.correct / row.answered) * 100 }));
    const mineValue =
      values.find((item) => item.id === studentId)?.value ?? null;
    const minimum = this.config.get('platformComparisonMinSample', {
      infer: true,
    });
    const peers = values.filter((item) => item.id !== studentId);
    if (mineValue === null || peers.length < minimum)
      return {
        status: 'INSUFFICIENT_DATA',
        scope: {
          subjectId: query.subjectId,
          courseId: query.courseId,
          chapterIds: mine.chapterIds,
          comparisonChapterId: query.chapterId ?? null,
        },
        cohort: {
          type: 'SHARED_CONTENT_SCOPE',
          sampleSize: peers.length,
          minimumSampleSize: minimum,
        },
        student:
          mineValue === null
            ? null
            : { accuracyPercent: this.round(mineValue), percentile: null },
        peers: null,
      };
    const sorted = peers.map((item) => item.value).sort((a, b) => a - b);
    const average = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      status: 'AVAILABLE',
      scope: {
        subjectId: query.subjectId,
        courseId: query.courseId,
        chapterIds: mine.chapterIds,
        comparisonChapterId: query.chapterId ?? null,
      },
      cohort: {
        type: 'SHARED_CONTENT_SCOPE',
        sampleSize: peers.length,
        minimumSampleSize: minimum,
      },
      student: {
        accuracyPercent: this.round(mineValue),
        percentile: Math.round(
          (sorted.filter((value) => value <= mineValue).length /
            sorted.length) *
            100,
        ),
      },
      peers: {
        averageAccuracyPercent: this.round(average),
        medianAccuracyPercent: this.round(median),
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
            ...(date.from || date.to
              ? {
                  startedAt: {
                    ...(date.from ? { gte: date.from } : {}),
                    ...(date.to ? { lte: date.to } : {}),
                  },
                }
              : {}),
          },
          assessmentQuestion: {
            placements: {
              some: {
                ...(query.subjectId ? { subjectId: query.subjectId } : {}),
                ...(query.courseId ? { courseId: query.courseId } : {}),
                ...(query.chapterId ? { chapterId: query.chapterId } : {}),
              },
            },
          },
        },
      },
      orderBy: { changedAt: 'desc' },
    });
    const correctToIncorrect = changes.filter(
      (change) =>
        change.fromOutcome === 'CORRECT' && change.toOutcome === 'INCORRECT',
    ).length;
    const incorrectToCorrect = changes.filter(
      (change) =>
        change.fromOutcome === 'INCORRECT' && change.toOutcome === 'CORRECT',
    ).length;
    return {
      totalChanges: changes.length,
      correctToIncorrect,
      incorrectToCorrect,
      data: changes.map((change) => ({
        id: change.id,
        fromOutcome: change.fromOutcome,
        toOutcome: change.toOutcome,
        changedAt: change.changedAt,
      })),
    };
  }
}
