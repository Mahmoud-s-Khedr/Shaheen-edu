import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessType,
  ContentStatus,
  EntitlementStatus,
  QuestionStatus,
  QuestionType,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestParentSession } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { ContentAccessPolicyService } from '../entitlements/content-access-policy.service';
import { AssetsService } from '../assets/assets.service';
import { VideosService } from '../videos/videos.service';
import type {
  PracticeScopeQueryDto,
  UpdateContentStudyStateDto,
} from './dto/learning.dto';

type ScopeField = 'courseId' | 'chapterId' | 'lessonId' | 'sectionId';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ContentAccessPolicyService,
    private readonly assets: AssetsService,
    private readonly videos: VideosService,
  ) {}

  async completeContent(studentId: string, contentItemId: string) {
    await this.access.assertContentItemAccess(contentItemId, studentId);
    const progress = await this.prisma.studentContentProgress.upsert({
      where: {
        studentUserId_contentItemId: {
          studentUserId: studentId,
          contentItemId,
        },
      },
      create: {
        studentUserId: studentId,
        contentItemId,
        completedAt: new Date(),
      },
      update: {},
    });
    return {
      contentItemId,
      completedAt: progress.completedAt,
      completed: true,
    };
  }

  async contentProgress(studentId: string, contentItemId: string) {
    const progress = await this.prisma.studentContentProgress.findUnique({
      where: {
        studentUserId_contentItemId: {
          studentUserId: studentId,
          contentItemId,
        },
      },
    });
    return {
      completed: Boolean(progress),
      completedAt: progress?.completedAt ?? null,
    };
  }

  async updateStudyState(
    studentId: string,
    contentItemId: string,
    dto: UpdateContentStudyStateDto,
  ) {
    await this.access.assertContentItemAccess(contentItemId, studentId);
    const lastOpenedAt = new Date();
    const state = await this.prisma.studentContentStudyState.upsert({
      where: {
        studentUserId_contentItemId: {
          studentUserId: studentId,
          contentItemId,
        },
      },
      create: {
        studentUserId: studentId,
        contentItemId,
        lastOpenedAt,
        playbackPositionSeconds: dto.playbackPositionSeconds ?? null,
      },
      update: {
        lastOpenedAt,
        ...(dto.playbackPositionSeconds !== undefined
          ? { playbackPositionSeconds: dto.playbackPositionSeconds }
          : {}),
      },
    });
    return {
      contentItemId,
      studyState: {
        lastOpenedAt: state.lastOpenedAt,
        playbackPositionSeconds: state.playbackPositionSeconds,
      },
    };
  }

  private async eligibleItems(
    studentId: string,
    currentGradeOnly = true,
    subjectId?: string,
  ) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { academicGradeId: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const items = await this.prisma.contentItem.findMany({
      where: {
        status: ContentStatus.PUBLISHED,
        placement: subjectId ? { is: { subjectId } } : { isNot: null },
      },
      include: {
        placement: {
          include: {
            course: {
              include: { subject: { include: { academicGrade: true } } },
            },
            chapter: {
              include: {
                course: {
                  include: { subject: { include: { academicGrade: true } } },
                },
              },
            },
            lesson: {
              include: {
                chapter: {
                  include: {
                    course: {
                      include: {
                        subject: { include: { academicGrade: true } },
                      },
                    },
                  },
                },
              },
            },
            section: {
              include: {
                lesson: {
                  include: {
                    chapter: {
                      include: {
                        course: {
                          include: {
                            subject: { include: { academicGrade: true } },
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
      },
    });
    const eligible: any[] = [];
    for (const item of items) {
      const gradeId = this.itemPath(item).course.subject.academicGradeId;
      if (currentGradeOnly && gradeId !== student.academicGradeId) continue;
      if (await this.access.canAccessContentItem(item.id, studentId))
        eligible.push(item);
    }
    return eligible;
  }

  private itemPath(item: any) {
    const p = item.placement;
    if (p.section)
      return {
        course: p.section.lesson.chapter.course,
        chapter: p.section.lesson.chapter,
        lesson: p.section.lesson,
        section: p.section,
      };
    if (p.lesson)
      return {
        course: p.lesson.chapter.course,
        chapter: p.lesson.chapter,
        lesson: p.lesson,
        section: null,
      };
    if (p.chapter)
      return {
        course: p.chapter.course,
        chapter: p.chapter,
        lesson: null,
        section: null,
      };
    return { course: p.course, chapter: null, lesson: null, section: null };
  }

  private node(record: any) {
    return record
      ? {
          id: record.id,
          title: record.title,
          slug: record.slug,
          description: record.description,
          sortOrder: record.sortOrder,
          coverAssetId: record.coverAssetId ?? null,
        }
      : null;
  }

  private publishedPath(item: any) {
    const path = this.itemPath(item);
    return [path.course, path.chapter, path.lesson, path.section]
      .filter(Boolean)
      .every((node: any) => node.status === ContentStatus.PUBLISHED);
  }

  private async subjectProgress(
    studentId: string,
    subjectId: string,
    items: any[],
  ) {
    const subjectItems = items.filter(
      (item) => this.itemPath(item).course.subjectId === subjectId,
    );
    const completedItems = await this.prisma.studentContentProgress.count({
      where: {
        studentUserId: studentId,
        contentItemId: { in: subjectItems.map((item) => item.id) },
      },
    });
    return {
      totalContentItems: subjectItems.length,
      completedContentItems: completedItems,
      completionPercent: subjectItems.length
        ? Math.round((completedItems / subjectItems.length) * 100)
        : 0,
    };
  }

  async continueStudying(studentId: string) {
    const batchSize = 25;
    let cursor: { lastOpenedAt: Date; id: string } | undefined;
    for (;;) {
      const states = await this.prisma.studentContentStudyState.findMany({
        where: {
          studentUserId: studentId,
          ...(cursor
            ? {
                OR: [
                  { lastOpenedAt: { lt: cursor.lastOpenedAt } },
                  { lastOpenedAt: cursor.lastOpenedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ lastOpenedAt: 'desc' }, { id: 'desc' }],
        take: batchSize,
      });
      if (!states.length) return { data: null };
      for (const state of states) {
        let item: any;
        try {
          item = await this.access.assertContentItemAccess(
            state.contentItemId,
            studentId,
          );
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          )
            continue;
          throw error;
        }
        if (item.status !== ContentStatus.PUBLISHED || !this.publishedPath(item))
          continue;
        const path = this.itemPath(item);
        const progress = await this.contentProgress(studentId, item.id);
        const subjectItems = (await this.eligibleItems(
          studentId,
          false,
          path.course.subjectId,
        )).filter(
          (candidate) =>
            this.publishedPath(candidate) &&
            this.itemPath(candidate).course.subjectId === path.course.subjectId,
        );
        return {
          data: {
            contentItem: {
              id: item.id,
              type: item.type,
              title: item.title,
              description: item.description,
              estimatedDuration: item.estimatedDuration,
              progress,
            },
            studyState: {
              lastOpenedAt: state.lastOpenedAt,
              playbackPositionSeconds: state.playbackPositionSeconds,
            },
            subject: this.node(path.course.subject),
            course: this.node(path.course),
            chapter: this.node(path.chapter),
            lesson: this.node(path.lesson),
            section: this.node(path.section),
            subjectProgress: await this.subjectProgress(
              studentId,
              path.course.subjectId,
              subjectItems,
            ),
          },
        };
      }
      if (states.length < batchSize) return { data: null };
      const last = states.at(-1)!;
      cursor = { lastOpenedAt: last.lastOpenedAt, id: last.id };
    }
  }

  private async rollup(studentId: string, items: any[]) {
    const completed = new Set(
      (
        await this.prisma.studentContentProgress.findMany({
          where: {
            studentUserId: studentId,
            contentItemId: { in: items.map((x) => x.id) },
          },
          select: { contentItemId: true },
        })
      ).map((x) => x.contentItemId),
    );
    const nodes = new Map<string, any>();
    for (const item of items) {
      const path = this.itemPath(item);
      for (const [kind, node] of Object.entries(path))
        if (node) {
          const existing = nodes.get((node as any).id) ?? {
            id: (node as any).id,
            title: (node as any).title,
            kind,
            totalContentItems: 0,
            completedContentItems: 0,
          };
          existing.totalContentItems++;
          if (completed.has(item.id)) existing.completedContentItems++;
          nodes.set(existing.id, existing);
        }
    }
    return [...nodes.values()].map((node) => ({
      ...node,
      completionPercent: node.totalContentItems
        ? Math.round(
            (node.completedContentItems / node.totalContentItems) * 100,
          )
        : 0,
      completed:
        node.totalContentItems > 0 &&
        node.completedContentItems === node.totalContentItems,
    }));
  }

  async progress(studentId: string) {
    const items = await this.eligibleItems(studentId);
    const nodes = await this.rollup(studentId, items);
    const completedItems = await this.prisma.studentContentProgress.count({
      where: {
        studentUserId: studentId,
        contentItemId: { in: items.map((x) => x.id) },
      },
    });
    return {
      content: {
        totalItems: items.length,
        completedItems,
        completionPercent: items.length
          ? Math.round((completedItems / items.length) * 100)
          : 0,
      },
      courses: nodes.filter((x) => x.kind === 'course'),
      chapters: nodes.filter((x) => x.kind === 'chapter'),
      lessons: nodes.filter((x) => x.kind === 'lesson'),
      sections: nodes.filter((x) => x.kind === 'section'),
    };
  }

  async libraryProgress(
    studentId: string,
    targetType: string,
    targetId: string,
  ) {
    if (targetType !== 'COURSE' && targetType !== 'CHAPTER')
      throw new BadRequestException('targetType must be COURSE or CHAPTER');
    const items = (await this.eligibleItems(studentId, false)).filter(
      (item) => {
        const path = this.itemPath(item);
        return targetType === 'COURSE'
          ? path.course.id === targetId
          : path.chapter?.id === targetId;
      },
    );
    if (!items.length)
      throw new ForbiddenException(
        'No accessible published content exists for this target',
      );
    return { targetType, targetId, nodes: await this.rollup(studentId, items) };
  }

  private scope(query: PracticeScopeQueryDto): {
    field: ScopeField;
    id: string;
  } {
    const values = (
      ['courseId', 'chapterId', 'lessonId', 'sectionId'] as ScopeField[]
    ).filter((field) => Boolean(query[field]));
    if (values.length !== 1)
      throw new BadRequestException('Provide exactly one practice scope');
    return { field: values[0], id: query[values[0]]!.trim() };
  }

  private placementInScope(
    placement: any,
    scope: { field: ScopeField; id: string },
  ) {
    if (scope.field === 'courseId')
      return (
        placement.courseId === scope.id ||
        placement.chapter?.courseId === scope.id ||
        placement.lesson?.chapter?.courseId === scope.id ||
        placement.section?.lesson?.chapter?.courseId === scope.id
      );
    if (scope.field === 'chapterId')
      return (
        placement.chapterId === scope.id ||
        placement.lesson?.chapterId === scope.id ||
        placement.section?.lesson?.chapterId === scope.id
      );
    if (scope.field === 'lessonId')
      return (
        placement.lessonId === scope.id ||
        placement.section?.lessonId === scope.id
      );
    return placement.sectionId === scope.id;
  }

  private async practiceQuestions(
    studentId: string,
    scope?: { field: ScopeField; id: string },
  ) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { academicGradeId: true },
    });
    const questions = await this.prisma.question.findMany({
      where: {
        status: QuestionStatus.PUBLISHED,
        bank: { status: ContentStatus.PUBLISHED },
        source: { status: ContentStatus.PUBLISHED },
        course: {
          status: ContentStatus.PUBLISHED,
          subject: {
            status: ContentStatus.PUBLISHED,
            academicGradeId: student?.academicGradeId ?? '__missing__',
            academicGrade: { status: ContentStatus.PUBLISHED },
          },
        },
      },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        videoLink: { include: { videoAsset: { include: { asset: true } } } },
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
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    const accessible = [] as any[];
    for (const question of questions) {
      const placements = scope
        ? question.placements.filter((p) => this.placementInScope(p, scope))
        : question.placements;
      if (!placements.length) continue;
      if (await this.questionAccessible(studentId, placements))
        accessible.push({ ...question, placements });
    }
    return accessible;
  }

  private async questionAccessible(studentId: string, placements: any[]) {
    const now = new Date();
    for (const placement of placements) {
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
      if (nodes.some((node: any) => node.status !== ContentStatus.PUBLISHED))
        continue;
      const effective = nodes.find(
        (node: any) => node.accessType !== AccessType.INHERIT,
      )?.accessType;
      if (effective === AccessType.PUBLIC || effective === AccessType.FREE)
        return true;
      const course = nodes.at(-1);
      const chapterIds = nodes
        .filter((node: any) => node.courseId)
        .map((node: any) => node.id);
      if (
        await this.prisma.studentEntitlement.findFirst({
          where: {
            studentUserId: studentId,
            status: EntitlementStatus.ACTIVE,
            revokedAt: null,
            startsAt: { lte: now },
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              {
                OR: [
                  { courseId: course.id },
                  { chapterId: { in: chapterIds } },
                ],
              },
            ],
          },
        })
      )
        return true;
    }
    return false;
  }

  private learnerQuestion(question: any, attempts: any[] = []) {
    const last = attempts[0];
    return {
      id: question.id,
      type: question.type,
      body: question.body,
      placements: question.placements.map((p: any) => ({
        courseId: p.courseId,
        chapterId: p.chapterId,
        lessonId: p.lessonId,
        sectionId: p.sectionId,
      })),
      options: question.options.map((x: any) => ({
        id: x.id,
        body: x.body,
        sortOrder: x.sortOrder,
      })),
      attachments: question.assets.map((x: any) => ({
        id: x.asset.id,
        kind: x.asset.kind,
        filename: x.asset.filename,
        sortOrder: x.sortOrder,
      })),
      video: question.videoLink
        ? {
            assetId: question.videoLink.videoAssetId,
            timestampSeconds: question.videoLink.timestampSeconds,
          }
        : null,
      attemptCount: attempts.length,
      solved: attempts.some((x) => x.isCorrect),
      lastAttemptAt: last?.submittedAt ?? null,
    };
  }

  async questions(studentId: string, query: PracticeScopeQueryDto) {
    const questions = await this.practiceQuestions(
      studentId,
      this.scope(query),
    );
    const attempts = await this.prisma.studentQuestionAttempt.findMany({
      where: {
        studentUserId: studentId,
        questionId: { in: questions.map((x) => x.id) },
      },
      orderBy: { submittedAt: 'desc' },
    });
    const byQuestion = new Map<string, any[]>();
    for (const attempt of attempts)
      byQuestion.set(attempt.questionId, [
        ...(byQuestion.get(attempt.questionId) ?? []),
        attempt,
      ]);
    const start = (query.page - 1) * query.limit;
    return {
      data: questions
        .slice(start, start + query.limit)
        .map((x) => this.learnerQuestion(x, byQuestion.get(x.id) ?? [])),
      meta: toPaginationMeta(query.page, query.limit, questions.length),
    };
  }

  async attempt(studentId: string, questionId: string, optionIds: string[]) {
    if (new Set(optionIds).size !== optionIds.length)
      throw new BadRequestException('optionIds must not contain duplicates');
    const question = (await this.practiceQuestions(studentId)).find(
      (x) => x.id === questionId,
    );
    if (!question) throw new NotFoundException('Eligible question not found');
    if (question.type === QuestionType.SINGLE_CHOICE && optionIds.length !== 1)
      throw new BadRequestException(
        'Single-choice questions require exactly one option',
      );
    if (
      !optionIds.every((id) => question.options.some((x: any) => x.id === id))
    )
      throw new BadRequestException(
        'Selected options do not belong to the question',
      );
    const correct = question.options
      .filter((x: any) => x.isCorrect)
      .map((x: any) => x.id)
      .sort();
    const selected = [...optionIds].sort();
    const isCorrect =
      correct.length === selected.length &&
      correct.every((id: string, index: number) => id === selected[index]);
    const attempt = await this.prisma.$transaction(
      async (tx) => {
        const count = await tx.studentQuestionAttempt.count({
          where: { studentUserId: studentId, questionId },
        });
        return tx.studentQuestionAttempt.create({
          data: {
            studentUserId: studentId,
            questionId,
            attemptNumber: count + 1,
            isCorrect,
            answers: { create: optionIds.map((optionId) => ({ optionId })) },
          },
          include: { answers: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
    return {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      selectedOptionIds: optionIds,
      isCorrect,
      correctOptionIds: correct,
      explanation: question.explanation,
      submittedAt: attempt.submittedAt,
    };
  }

  async questionAssetAccess(
    studentId: string,
    questionId: string,
    assetId: string,
  ) {
    const question = (await this.practiceQuestions(studentId)).find(
      (x) => x.id === questionId,
    );
    if (
      !question ||
      (!question.assets.some((x: any) => x.assetId === assetId) &&
        question.videoLink?.videoAssetId !== assetId)
    )
      throw new NotFoundException('Eligible question asset not found');
    const asset = await this.assets.getReady(assetId);
    return asset.kind === 'VIDEO'
      ? this.videos.playback(assetId)
      : this.assets.protectedAccess(asset);
  }

  async attempts(
    studentId: string,
    questionId: string,
    query: PracticeScopeQueryDto,
  ) {
    if (
      !(await this.practiceQuestions(studentId)).some(
        (x) => x.id === questionId,
      )
    )
      throw new NotFoundException('Eligible question not found');
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentQuestionAttempt.findMany({
        where: { studentUserId: studentId, questionId },
        include: { answers: true },
        orderBy: { attemptNumber: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentQuestionAttempt.count({
        where: { studentUserId: studentId, questionId },
      }),
    ]);
    return {
      data: data.map((x) => ({
        id: x.id,
        attemptNumber: x.attemptNumber,
        selectedOptionIds: x.answers.map((a) => a.optionId),
        isCorrect: x.isCorrect,
        submittedAt: x.submittedAt,
      })),
      meta: toPaginationMeta(query.page, query.limit, total),
    };
  }

  async performance(studentId: string) {
    const questions = await this.practiceQuestions(studentId);
    const attempts = await this.prisma.studentQuestionAttempt.findMany({
      where: {
        studentUserId: studentId,
        questionId: { in: questions.map((x) => x.id) },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const byQuestion = new Map<string, any[]>();
    for (const item of attempts)
      byQuestion.set(item.questionId, [
        ...(byQuestion.get(item.questionId) ?? []),
        item,
      ]);
    const attempted = [...byQuestion.values()];
    const solved = attempted.filter((x) => x.some((a) => a.isCorrect));
    return {
      totalQuestions: questions.length,
      attemptedQuestions: attempted.length,
      solvedQuestions: solved.length,
      totalAttempts: attempts.length,
      accuracyPercent: attempts.length
        ? Math.round(
            (attempts.filter((x) => x.isCorrect).length / attempts.length) *
              100,
          )
        : 0,
      firstTryCorrect: attempted.filter((x) => x[0].isCorrect).length,
      lastActivityAt: attempts.at(-1)?.submittedAt ?? null,
    };
  }

  async parentPerformance(parent: RequestParentSession) {
    if (!parent.activeStudentId)
      throw new ForbiddenException('No child selected');
    const child = await this.prisma.studentProfile.findUnique({
      where: { userId: parent.activeStudentId },
      select: { fullName: true, parentPhoneNormalized: true },
    });
    if (!child || child.parentPhoneNormalized !== parent.parentPhoneNormalized)
      throw new ForbiddenException('Student is not linked to this parent');
    const [progress, performance] = await Promise.all([
      this.progress(parent.activeStudentId),
      this.performance(parent.activeStudentId),
    ]);
    return {
      child: { userId: parent.activeStudentId, fullName: child.fullName },
      progress: {
        courses: progress.courses,
        chapters: progress.chapters,
        lessons: progress.lessons,
        sections: progress.sections,
      },
      performance,
    };
  }
}
