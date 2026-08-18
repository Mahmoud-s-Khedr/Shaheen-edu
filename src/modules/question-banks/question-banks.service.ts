import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AssetKind,
  AssetStatus,
  ContentStatus,
  PartnerType,
  QuestionAnswerProvenance,
  QuestionContentBlockType,
  QuestionExplanationOrigin,
  QuestionSourceType,
  QuestionStatus,
  QuestionType,
  Role,
  VideoProcessingStatus,
} from '../../common/types/roles.enum';
import { toPaginationMeta } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import {
  paginateArabicSearch,
  sqlAnd,
} from '../../common/search/arabic-search';
import { contentStatusScope } from '../../common/search/content-scope';
import { AuditService } from '../audit/audit.service';
import {
  CreateQuestionBankDto,
  CreateQuestionContextDto,
  CreateQuestionDto,
  CreateQuestionOptionDto,
  CreateQuestionSourceDto,
  QueryQuestionBankDto,
  QueryQuestionDto,
  QueryQuestionSourceDto,
  QuestionPlacementDto,
  SetQuestionVideoLinkDto,
  UpdateQuestionBankDto,
  UpdateQuestionContextDto,
  UpdateQuestionDto,
  UpdateQuestionOptionDto,
  UpdateQuestionSourceDto,
} from './dto/question-banks.dto';

@Injectable()
export class QuestionBanksService {
  private static readonly LEGACY_ATTACHMENT_KINDS: AssetKind[] = [
    AssetKind.IMAGE,
    AssetKind.PDF,
    AssetKind.DOCUMENT,
  ];
  private static readonly ASSET_BLOCK_KINDS: AssetKind[] = [
    AssetKind.PDF,
    AssetKind.DOCUMENT,
    AssetKind.DOWNLOADABLE_FILE,
    AssetKind.VIDEO,
  ];
  private static readonly MAX_CONTENT_BLOCKS = 100;
  private static readonly MAX_TABLE_ROWS = 50;
  private static readonly MAX_TABLE_COLUMNS = 30;
  private static readonly MAX_TABLE_CELL_LENGTH = 2_000;
  private static readonly MAX_TABLE_BYTES = 100_000;
  private static readonly MAX_CONTENT_BYTES = 250_000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private admin(actor: RequestUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Forbidden');
  }
  private async log(
    actor: RequestUser,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: object,
  ) {
    await this.audit.record({
      actorUserId: actor.id,
      action,
      targetType,
      targetId,
      metadata,
    });
  }
  private async publisher(
    type: QuestionSourceType,
    publisherUserId?: string | null,
  ) {
    if (type !== QuestionSourceType.CONTENT_PUBLISHER) {
      if (publisherUserId)
        throw new BadRequestException(
          'publisherUserId is allowed only for CONTENT_PUBLISHER sources',
        );
      return null;
    }
    if (!publisherUserId)
      throw new BadRequestException(
        'CONTENT_PUBLISHER source requires publisherUserId',
      );
    const publisher = await this.prisma.partnerProfile.findUnique({
      where: { userId: publisherUserId },
    });
    if (!publisher || publisher.partnerType !== PartnerType.CONTENT_PUBLISHER)
      throw new BadRequestException(
        'publisherUserId must reference a CONTENT_PUBLISHER partner',
      );
    return publisherUserId;
  }
  private async source(id: string) {
    const x = await this.prisma.questionSource.findUnique({
      where: { id },
      include: { publisher: { select: { displayName: true } } },
    });
    if (!x) throw new NotFoundException('Question source not found');
    return x;
  }
  private async bank(id: string) {
    const x = await this.prisma.questionBank.findUnique({
      where: { id },
      include: { subject: { select: { title: true } } },
    });
    if (!x) throw new NotFoundException('Question bank not found');
    return x;
  }
  private placementInclude() {
    return {
      course: { select: { title: true } },
      chapter: { select: { title: true } },
      lesson: { select: { title: true } },
      section: { select: { title: true } },
    };
  }
  private async question(id: string) {
    const x = await this.prisma.question.findUnique({
      where: { id },
      include: {
        source: { include: { publisher: { select: { displayName: true } } } },
        bank: true,
        course: { include: { subject: { include: { academicGrade: true } } } },
        placements: { include: this.placementInclude() },
        contentBlocks: {
          include: { asset: { include: { video: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        options: {
          include: {
            contentBlocks: {
              include: { asset: { include: { video: true } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
        videoLink: { include: { videoAsset: { include: { asset: true } } } },
        contexts: {
          include: {
            context: {
              include: {
                contentBlocks: {
                  include: { asset: { include: { video: true } } },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        structuredExplanation: true,
      },
    });
    if (!x) throw new NotFoundException('Question not found');
    return x;
  }
  private editable(status: QuestionStatus) {
    if (
      status === QuestionStatus.PUBLISHED ||
      status === QuestionStatus.ARCHIVED
    )
      throw new ConflictException(
        'Published or archived questions cannot be edited',
      );
  }
  private async draftSource(id: string) {
    const item = await this.source(id);
    if (item.status !== ContentStatus.DRAFT)
      throw new ConflictException('Only draft records can be edited');
    return item;
  }
  private async draftBank(id: string) {
    const item = await this.bank(id);
    if (item.status !== ContentStatus.DRAFT)
      throw new ConflictException('Only draft records can be edited');
    return item;
  }

  async createSource(actor: RequestUser, dto: CreateQuestionSourceDto) {
    this.admin(actor);
    const publisherUserId = await this.publisher(dto.type, dto.publisherUserId);
    const item = await this.prisma.questionSource.create({
      data: {
        type: dto.type,
        titleAr: dto.title.ar.trim(),
        titleEn: dto.title.en.trim(),
        noteAr: dto.note?.ar,
        noteEn: dto.note?.en,
        publisherUserId,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.log(
      actor,
      'QUESTION_SOURCE_CREATED',
      'QuestionSource',
      item.id,
      { type: item.type },
    );
    return this.sourceDto(await this.source(item.id));
  }
  async listSources(actor: RequestUser, q: QueryQuestionSourceDto) {
    this.admin(actor);
    const where = {
      status: q.status ?? { not: ContentStatus.ARCHIVED },
      type: q.type,
    };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.questionSource,
      target: 'questionSource',
      q: q.q,
      scope: {
        where: sqlAnd(
          contentStatusScope(q.status),
          q.type
            ? Prisma.sql`t.type = ${q.type}::"QuestionSourceType"`
            : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id ASC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where,
      args: { include: { publisher: { select: { displayName: true } } } },
      page: q.page,
      limit: q.limit,
    });
    return {
      data: data.map((item) => this.sourceDto(item)),
      meta: toPaginationMeta(q.page, q.limit, total),
    };
  }
  async getSource(actor: RequestUser, id: string) {
    this.admin(actor);
    return this.sourceDto(await this.source(id));
  }
  async updateSource(
    actor: RequestUser,
    id: string,
    dto: UpdateQuestionSourceDto,
  ) {
    this.admin(actor);
    const old = await this.draftSource(id);
    const type = dto.type ?? old.type;
    const publisherUserId = await this.publisher(
      type,
      dto.publisherUserId === undefined
        ? old.publisherUserId
        : dto.publisherUserId,
    );
    const item = await this.prisma.questionSource.update({
      where: { id },
      data: {
        type,
        titleAr: dto.title?.ar?.trim(),
        titleEn: dto.title?.en?.trim(),
        ...(dto.note === undefined
          ? {}
          : { noteAr: dto.note?.ar ?? null, noteEn: dto.note?.en ?? null }),
        publisherUserId,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_SOURCE_UPDATED', 'QuestionSource', id);
    return this.sourceDto(await this.source(item.id));
  }
  private async subject(id: string) {
    const item = await this.prisma.subject.findUnique({ where: { id } });
    if (!item || item.status === ContentStatus.ARCHIVED)
      throw new NotFoundException('Subject not found');
    return item;
  }
  async createBank(actor: RequestUser, dto: CreateQuestionBankDto) {
    this.admin(actor);
    await this.subject(dto.subjectId);
    const item = await this.prisma.questionBank.create({
      data: {
        subjectId: dto.subjectId,
        title: dto.title.trim(),
        description: dto.description,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_BANK_CREATED', 'QuestionBank', item.id);
    return this.bankDto(await this.bank(item.id));
  }
  async listBanks(actor: RequestUser, q: QueryQuestionBankDto) {
    this.admin(actor);
    const where = { status: q.status ?? { not: ContentStatus.ARCHIVED } };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.questionBank,
      target: 'questionBank',
      q: q.q,
      scope: { where: contentStatusScope(q.status) },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id ASC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where,
      args: { include: { subject: { select: { title: true } } } },
      page: q.page,
      limit: q.limit,
    });
    return {
      data: data.map((item) => this.bankDto(item)),
      meta: toPaginationMeta(q.page, q.limit, total),
    };
  }
  async getBank(actor: RequestUser, id: string) {
    this.admin(actor);
    return this.bankDto(await this.bank(id));
  }
  async updateBank(actor: RequestUser, id: string, dto: UpdateQuestionBankDto) {
    this.admin(actor);
    const bank = await this.draftBank(id);
    if (dto.subjectId && dto.subjectId !== bank.subjectId) {
      if (await this.prisma.question.count({ where: { bankId: id } }))
        throw new ConflictException(
          'Question bank subject cannot change after questions are attached',
        );
      await this.subject(dto.subjectId);
    }
    const item = await this.prisma.questionBank.update({
      where: { id },
      data: {
        subjectId: dto.subjectId,
        title: dto.title?.trim(),
        description: dto.description,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_BANK_UPDATED', 'QuestionBank', id);
    return this.bankDto(await this.bank(item.id));
  }
  async publishResource(
    actor: RequestUser,
    kind: 'source' | 'bank',
    id: string,
  ) {
    this.admin(actor);
    const item =
      kind === 'source' ? await this.draftSource(id) : await this.draftBank(id);
    const client: any =
      kind === 'source' ? this.prisma.questionSource : this.prisma.questionBank;
    await client.update({
      where: { id },
      data: {
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        updatedById: actor.id,
      },
    });
    await this.log(
      actor,
      `QUESTION_${kind.toUpperCase()}_PUBLISHED`,
      kind === 'source' ? 'QuestionSource' : 'QuestionBank',
      item.id,
    );
    return kind === 'source'
      ? this.sourceDto(await this.source(id))
      : this.bankDto(await this.bank(id));
  }
  async archiveResource(
    actor: RequestUser,
    kind: 'source' | 'bank',
    id: string,
  ) {
    this.admin(actor);
    const item: any =
      kind === 'source' ? await this.source(id) : await this.bank(id);
    if (item.status === ContentStatus.ARCHIVED)
      throw new ConflictException('Record is already archived');
    const count = await this.prisma.question.count({
      where: {
        [kind === 'source' ? 'sourceId' : 'bankId']: id,
        status: QuestionStatus.PUBLISHED,
      },
    });
    if (count)
      throw new ConflictException(
        'Cannot archive a source or bank with published questions',
      );
    const client: any =
      kind === 'source' ? this.prisma.questionSource : this.prisma.questionBank;
    await client.update({
      where: { id },
      data: {
        status: ContentStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: actor.id,
      },
    });
    await this.log(
      actor,
      `QUESTION_${kind.toUpperCase()}_ARCHIVED`,
      kind === 'source' ? 'QuestionSource' : 'QuestionBank',
      id,
    );
    return kind === 'source'
      ? this.sourceDto(await this.source(id))
      : this.bankDto(await this.bank(id));
  }
  async restoreResource(
    actor: RequestUser,
    kind: 'source' | 'bank',
    id: string,
  ) {
    this.admin(actor);
    const client: any =
      kind === 'source' ? this.prisma.questionSource : this.prisma.questionBank;
    const updated = await client.updateMany({
      where: { id, status: ContentStatus.ARCHIVED },
      data: {
        status: ContentStatus.DRAFT,
        archivedAt: null,
        publishedAt: null,
        updatedById: actor.id,
      },
    });
    if (!updated.count)
      throw new ConflictException('Only archived records can be restored');
    await this.log(
      actor,
      `QUESTION_${kind.toUpperCase()}_RESTORED`,
      kind === 'source' ? 'QuestionSource' : 'QuestionBank',
      id,
    );
    return kind === 'source'
      ? this.sourceDto(await this.source(id))
      : this.bankDto(await this.bank(id));
  }
  async deleteResource(
    actor: RequestUser,
    kind: 'source' | 'bank',
    id: string,
  ) {
    this.admin(actor);
    if (kind === 'source') await this.draftSource(id);
    else await this.draftBank(id);
    if (
      await this.prisma.question.count({
        where: { [kind === 'source' ? 'sourceId' : 'bankId']: id },
      })
    )
      throw new ConflictException(
        'Referenced source or bank cannot be deleted',
      );
    const client: any =
      kind === 'source' ? this.prisma.questionSource : this.prisma.questionBank;
    await client.delete({ where: { id } });
    await this.log(
      actor,
      `QUESTION_${kind.toUpperCase()}_DELETED`,
      kind === 'source' ? 'QuestionSource' : 'QuestionBank',
      id,
    );
    return { id, deleted: true };
  }

  private async course(id: string) {
    const x = await this.prisma.course.findUnique({ where: { id } });
    if (!x) throw new NotFoundException('Course not found');
    if (x.status === ContentStatus.ARCHIVED)
      throw new ConflictException('Archived courses cannot be used');
    return x;
  }
  private async placementData(
    courseId: string,
    placements: QuestionPlacementDto[],
  ) {
    const seen = new Set<string>();
    for (const placement of placements) {
      const targets = Object.entries(placement).filter(([, value]) =>
        Boolean(value),
      );
      if (targets.length !== 1)
        throw new BadRequestException(
          'Each question placement must have exactly one target',
        );
      const [field, id] = targets[0] as [keyof QuestionPlacementDto, string];
      const key = `${field}:${id}`;
      if (seen.has(key))
        throw new BadRequestException('Question placements must be unique');
      seen.add(key);
      const target: any =
        field === 'courseId'
          ? await this.prisma.course.findUnique({ where: { id } })
          : field === 'chapterId'
            ? await this.prisma.chapter.findUnique({ where: { id } })
            : field === 'lessonId'
              ? await this.prisma.lesson.findUnique({
                  where: { id },
                  include: { chapter: true },
                })
              : await this.prisma.section.findUnique({
                  where: { id },
                  include: { lesson: { include: { chapter: true } } },
                });
      if (!target || target.status === ContentStatus.ARCHIVED)
        throw new NotFoundException(`Placement ${field} not found`);
      const resolvedCourseId =
        field === 'courseId'
          ? target.id
          : field === 'chapterId'
            ? target.courseId
            : field === 'lessonId'
              ? target.chapter.courseId
              : target.lesson.chapter.courseId;
      if (resolvedCourseId !== courseId)
        throw new BadRequestException(
          'All question placements must belong to the question course',
        );
    }
    return placements.map((placement) => ({
      courseId: placement.courseId,
      chapterId: placement.chapterId,
      lessonId: placement.lessonId,
      sectionId: placement.sectionId,
    }));
  }
  private async assertBankCourseSubject(bankId: string, courseId: string) {
    const [bank, course] = await Promise.all([
      this.bank(bankId),
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: { subjectId: true },
      }),
    ]);
    if (!course || bank.subjectId !== course.subjectId)
      throw new BadRequestException(
        'Question course subject must match the question bank subject',
      );
  }
  private async contextLinks(contextIds: string[] = []) {
    if (new Set(contextIds).size !== contextIds.length)
      throw new BadRequestException('contextIds must be unique');
    if (!contextIds.length) return [];
    const count = await this.prisma.questionContext.count({
      where: { id: { in: contextIds } },
    });
    if (count !== contextIds.length)
      throw new NotFoundException('Question context not found');
    return contextIds.map((contextId, index) => ({
      contextId,
      sortOrder: index + 1,
    }));
  }
  private explanationCreate(
    x: any,
    origin: QuestionExplanationOrigin = QuestionExplanationOrigin.HUMAN,
  ) {
    return x ? { create: { ...x, origin } } : undefined;
  }
  private renderExplanation(x?: any) {
    return x
      ? [
          x.keywords,
          x.eliminationStrategy,
          x.whyCorrect,
          x.generalRule,
          x.whatIf,
          x.commonMistakes,
        ]
          .map((value) => value.trim())
          .join('\n\n')
      : undefined;
  }
  private async normalizedBlocks(
    body: string | undefined,
    blocks: any[] | undefined,
    allowEmpty = false,
  ) {
    const source = [
      ...(body?.trim()
        ? [{ type: QuestionContentBlockType.TEXT, text: body }]
        : []),
      ...(blocks ?? []),
    ];
    if (!source.length && !allowEmpty)
      throw new BadRequestException('A body or contentBlocks is required');
    if (source.length > QuestionBanksService.MAX_CONTENT_BLOCKS)
      throw new BadRequestException(
        `Content cannot contain more than ${QuestionBanksService.MAX_CONTENT_BLOCKS} blocks`,
      );
    const totalBytes = Buffer.byteLength(JSON.stringify(source), 'utf8');
    if (totalBytes > QuestionBanksService.MAX_CONTENT_BYTES)
      throw new BadRequestException('Content block payload is too large');
    const assetIds = [
      ...new Set(
        source
          .filter(
            (block) =>
              block.type === QuestionContentBlockType.IMAGE ||
              block.type === QuestionContentBlockType.ASSET,
          )
          .map((block) => block.assetId)
          .filter(Boolean),
      ),
    ];
    const assets = assetIds.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: assetIds } },
          include: { video: true },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const rows: any[] = [];
    for (const block of source) {
      const row: any = {
        type: block.type,
        text: block.text?.trim(),
        tableData: block.tableData,
        latex: block.latex?.trim(),
        mathml: block.mathml?.trim(),
        caption: block.caption?.trim(),
        altText: block.altText?.trim(),
        languageCode: block.languageCode?.trim(),
      };
      if (block.type === QuestionContentBlockType.TEXT && !row.text)
        throw new BadRequestException('Text blocks require text');
      if (block.type === QuestionContentBlockType.TABLE) {
        const cells = block.tableData?.cells;
        if (
          !Array.isArray(cells) ||
          !cells.length ||
          cells.length > QuestionBanksService.MAX_TABLE_ROWS ||
          cells[0]?.length > QuestionBanksService.MAX_TABLE_COLUMNS ||
          !cells.every(
            (r: any) =>
              Array.isArray(r) &&
              r.length === cells[0].length &&
              r.every(
                (c: any) =>
                  typeof c === 'string' &&
                  c.length <= QuestionBanksService.MAX_TABLE_CELL_LENGTH,
              ),
          ) ||
          typeof block.tableData?.headerRow !== 'boolean'
        )
          throw new BadRequestException(
            'Table blocks require a rectangular cell matrix and headerRow',
          );
        if (
          Buffer.byteLength(JSON.stringify(block.tableData), 'utf8') >
          QuestionBanksService.MAX_TABLE_BYTES
        )
          throw new BadRequestException('Table block is too large');
      }
      if (
        block.type === QuestionContentBlockType.EQUATION &&
        !row.latex &&
        !row.mathml
      )
        throw new BadRequestException(
          'Equation blocks require LaTeX or MathML',
        );
      if (
        block.type === QuestionContentBlockType.IMAGE ||
        block.type === QuestionContentBlockType.ASSET
      ) {
        if (!block.assetId)
          throw new BadRequestException('Media blocks require assetId');
        const asset = assetsById.get(block.assetId);
        if (
          !asset ||
          asset.status !== AssetStatus.READY ||
          asset.kind === AssetKind.PAYMENT_PROOF
        )
          throw new ConflictException('Content block asset must be ready');
        if (
          block.type === QuestionContentBlockType.IMAGE &&
          asset.kind !== AssetKind.IMAGE
        )
          throw new ConflictException('Image blocks require an image asset');
        if (
          block.type === QuestionContentBlockType.ASSET &&
          !QuestionBanksService.ASSET_BLOCK_KINDS.includes(asset.kind)
        )
          throw new ConflictException(
            'Asset blocks require a PDF, document, downloadable file, or video asset',
          );
        if (
          asset.kind === AssetKind.VIDEO &&
          asset.video?.processingStatus !== VideoProcessingStatus.READY
        )
          throw new ConflictException('Content block video must be ready');
        row.assetId = asset.id;
        row.asset = asset;
      }
      rows.push(row);
    }
    const bodyProjection = rows
      .map((x) =>
        x.type === QuestionContentBlockType.TEXT
          ? x.text
          : x.type === QuestionContentBlockType.TABLE
            ? x.tableData.cells.map((r: string[]) => r.join(' | ')).join('\n')
            : x.type === QuestionContentBlockType.EQUATION
              ? (x.latex ?? x.mathml)
              : (x.caption ?? x.altText ?? `[${x.type}]`),
      )
      .filter(Boolean)
      .join('\n\n');
    const referencedAssets = rows
      .filter((row) => row.assetId)
      .map((row) => row.assetId);
    if (new Set(referencedAssets).size !== referencedAssets.length)
      throw new BadRequestException(
        'An asset may appear only once in contentBlocks',
      );
    return { body: rows.length ? bodyProjection || '[Content]' : '', rows };
  }
  private blockCreate(rows: any[]) {
    return {
      create: rows.map((row, index) => ({
        ...row,
        asset: undefined,
        sortOrder: index + 1,
      })),
    };
  }
  async createQuestion(actor: RequestUser, dto: CreateQuestionDto) {
    this.admin(actor);
    await Promise.all([
      this.source(dto.sourceId),
      this.bank(dto.bankId),
      this.course(dto.courseId),
    ]);
    await this.assertBankCourseSubject(dto.bankId, dto.courseId);
    const [placements, contexts, content] = await Promise.all([
      this.placementData(dto.courseId, dto.placements),
      this.contextLinks(dto.contextIds),
      this.normalizedBlocks(dto.body, dto.contentBlocks),
    ]);
    const answerOrigin =
      dto.answerOrigin ??
      (dto.acceptedAnswers?.length || dto.gradingRubric
        ? QuestionAnswerProvenance.OFFICIAL
        : undefined);
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          bankId: dto.bankId,
          sourceId: dto.sourceId,
          courseId: dto.courseId,
          type: dto.type ?? QuestionType.SINGLE_CHOICE,
          body: content.body,
          contentBlocks: this.blockCreate(content.rows),
          explanation:
            dto.explanation ??
            this.renderExplanation(dto.structuredExplanation),
          maxPoints: dto.maxPoints ?? 1,
          acceptedAnswers: dto.acceptedAnswers?.map((answer) =>
            answer.trim(),
          ) as any,
          gradingRubric: dto.gradingRubric?.trim(),
          answerOrigin,
          answerReviewedAt:
            answerOrigin === QuestionAnswerProvenance.HUMAN_REVIEWED
              ? new Date()
              : null,
          answerReviewedById:
            answerOrigin === QuestionAnswerProvenance.HUMAN_REVIEWED
              ? actor.id
              : null,
          createdById: actor.id,
          updatedById: actor.id,
          placements: { create: placements },
          contexts: { create: contexts },
          structuredExplanation: this.explanationCreate(
            dto.structuredExplanation,
          ),
        },
      });
      await this.syncQuestionAssets(tx, created.id, content.rows);
      return created;
    });
    await this.log(actor, 'QUESTION_CREATED', 'Question', item.id);
    return this.getQuestion(actor, item.id);
  }
  private async syncQuestionAssets(
    client: any,
    questionId: string,
    rows: any[],
  ) {
    const assetIds = rows
      .filter(
        (row) =>
          row.assetId &&
          row.asset &&
          QuestionBanksService.LEGACY_ATTACHMENT_KINDS.includes(row.asset.kind),
      )
      .map((row) => row.assetId);
    await client.questionAsset.deleteMany({ where: { questionId } });
    for (let i = 0; i < assetIds.length; i++)
      await client.questionAsset.create({
        data: { questionId, assetId: assetIds[i], sortOrder: i + 1 },
      });
  }
  private isPlainTextOnly(blocks: Array<{ type: QuestionContentBlockType }>) {
    return (
      blocks.length === 1 && blocks[0].type === QuestionContentBlockType.TEXT
    );
  }
  private rejectUnsafeLegacyBodyUpdate(
    body: string | undefined,
    blocks: any[] | undefined,
    existingBlocks: Array<{ type: QuestionContentBlockType }>,
  ) {
    if (
      body !== undefined &&
      blocks === undefined &&
      !this.isPlainTextOnly(existingBlocks)
    )
      throw new ConflictException(
        'Mixed content must be updated with an explicit contentBlocks payload',
      );
  }
  async validateImportTarget(
    actor: RequestUser,
    dto: Pick<
      CreateQuestionDto,
      'bankId' | 'sourceId' | 'courseId' | 'placements'
    >,
  ) {
    this.admin(actor);
    await Promise.all([
      this.source(dto.sourceId),
      this.bank(dto.bankId),
      this.course(dto.courseId),
    ]);
    await this.assertBankCourseSubject(dto.bankId, dto.courseId);
    await this.placementData(dto.courseId, dto.placements);
  }
  /** Internal AI-import entry point. It deliberately creates the same ordinary DRAFT questions as the admin UI. */
  async createImportedDraft(
    actor: RequestUser,
    dto: CreateQuestionDto & {
      options: Array<{ body: string; isCorrect: boolean }>;
    },
  ) {
    this.admin(actor);
    await Promise.all([
      this.source(dto.sourceId),
      this.bank(dto.bankId),
      this.course(dto.courseId),
    ]);
    await this.assertBankCourseSubject(dto.bankId, dto.courseId);
    const placements = await this.placementData(dto.courseId, dto.placements);
    return this.prisma.$transaction((tx) =>
      this.createImportedDraftWithClient(actor, dto, tx, placements),
    );
  }
  /** Creates an imported draft with its caller's transaction so import bookkeeping can be atomic. */
  async createImportedDraftWithClient(
    actor: RequestUser,
    dto: CreateQuestionDto & {
      options: Array<{ body: string; isCorrect: boolean }>;
      contextIds?: string[];
      aiExplanation?: any;
      aiAnswerOrigin?: any;
      confidence?: number;
      warnings?: string[];
      model?: string;
    },
    client: Prisma.TransactionClient,
    placements?: Array<{
      courseId?: string;
      chapterId?: string;
      lessonId?: string;
      sectionId?: string;
    }>,
  ) {
    this.admin(actor);
    const correct = dto.options.filter((option) => option.isCorrect).length;
    if (
      dto.options.length < 2 ||
      correct < 1 ||
      (dto.type === QuestionType.SINGLE_CHOICE && correct !== 1) ||
      (dto.type === QuestionType.MULTIPLE_CHOICE && correct < 2)
    )
      throw new BadRequestException(
        'Imported question options do not satisfy its answer type',
      );
    const resolvedPlacements =
      placements ?? (await this.placementData(dto.courseId, dto.placements));
    const contexts = await this.contextLinks(dto.contextIds);
    const importedBody = dto.body?.trim() || '[Content]';
    const item = await client.question.create({
      data: {
        bankId: dto.bankId,
        sourceId: dto.sourceId,
        courseId: dto.courseId,
        type: dto.type ?? QuestionType.SINGLE_CHOICE,
        body: importedBody,
        contentBlocks: {
          create: [
            {
              type: QuestionContentBlockType.TEXT,
              text: importedBody,
              sortOrder: 1,
            },
          ],
        },
        explanation: dto.explanation?.trim(),
        createdById: actor.id,
        updatedById: actor.id,
        placements: { create: resolvedPlacements },
        contexts: { create: contexts },
        options: {
          create: dto.options.map((option, index) => ({
            body: option.body.trim(),
            contentBlocks: {
              create: [
                {
                  type: QuestionContentBlockType.TEXT,
                  text: option.body.trim(),
                  sortOrder: 1,
                },
              ],
            },
            isCorrect: option.isCorrect,
            sortOrder: index + 1,
          })),
        },
        structuredExplanation: dto.aiExplanation
          ? {
              create: {
                ...dto.aiExplanation,
                origin: QuestionExplanationOrigin.AI,
                model: dto.model,
                confidence: dto.confidence,
                answerOrigin: dto.aiAnswerOrigin,
                warnings: dto.warnings as any,
              },
            }
          : undefined,
      },
    });
    await this.audit.recordWithClient(client, {
      actorUserId: actor.id,
      action: 'QUESTION_CREATED_FROM_AI_IMPORT',
      targetType: 'Question',
      targetId: item.id,
    });
    return item;
  }
  async listQuestions(actor: RequestUser, q: QueryQuestionDto) {
    this.admin(actor);
    const placementWhere = q.chapterId
      ? { chapterId: q.chapterId }
      : q.lessonId
        ? { lessonId: q.lessonId }
        : q.sectionId
          ? { sectionId: q.sectionId }
          : undefined;
    const where: any = {
      status: q.status ?? { not: QuestionStatus.ARCHIVED },
      bankId: q.bankId,
      sourceId: q.sourceId,
      courseId: q.courseId,
      placements: placementWhere ? { some: placementWhere } : undefined,
      course:
        q.subjectId || q.academicGradeId
          ? {
              subject: {
                ...(q.subjectId ? { id: q.subjectId } : {}),
                ...(q.academicGradeId
                  ? { academicGradeId: q.academicGradeId }
                  : {}),
              },
            }
          : undefined,
    };
    const include: any = {
      course: { include: { subject: { include: { academicGrade: true } } } },
      placements: { include: this.placementInclude() },
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
      assets: { include: { asset: true }, orderBy: { sortOrder: 'asc' } },
      videoLink: { include: { videoAsset: { include: { asset: true } } } },
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
      structuredExplanation: true,
    };
    const { data, total } = await paginateArabicSearch({
      prisma: this.prisma,
      delegate: this.prisma.question,
      target: 'question',
      q: q.q,
      scope: {
        where: sqlAnd(
          q.status
            ? Prisma.sql`t.status = ${q.status}::"QuestionStatus"`
            : Prisma.sql`t.status <> 'ARCHIVED'::"QuestionStatus"`,
          q.bankId ? Prisma.sql`t."bankId" = ${q.bankId}` : undefined,
          q.sourceId ? Prisma.sql`t."sourceId" = ${q.sourceId}` : undefined,
          q.courseId ? Prisma.sql`t."courseId" = ${q.courseId}` : undefined,
          placementWhere
            ? Prisma.sql`EXISTS (SELECT 1 FROM "QuestionPlacement" qp WHERE qp."questionId" = t.id AND ${Prisma.raw(`qp."${Object.keys(placementWhere)[0]}"`)} = ${Object.values(placementWhere)[0]})`
            : undefined,
          q.subjectId || q.academicGradeId
            ? Prisma.sql`EXISTS (SELECT 1 FROM "Course" c JOIN "Subject" s ON s.id = c."subjectId" WHERE c.id = t."courseId" ${q.subjectId ? Prisma.sql`AND s.id = ${q.subjectId}` : Prisma.empty} ${q.academicGradeId ? Prisma.sql`AND s."academicGradeId" = ${q.academicGradeId}` : Prisma.empty})`
            : undefined,
        ),
      },
      orderBySql: Prisma.sql`t."createdAt" DESC, t.id ASC`,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where,
      args: { include },
      page: q.page,
      limit: q.limit,
    });
    return {
      data: data.map((x) => this.adminDto(x)),
      meta: toPaginationMeta(q.page, q.limit, total),
    };
  }
  async getQuestion(actor: RequestUser, id: string) {
    this.admin(actor);
    return this.adminDto(await this.question(id));
  }
  async updateQuestion(actor: RequestUser, id: string, dto: UpdateQuestionDto) {
    this.admin(actor);
    const old = await this.question(id);
    this.editable(old.status);
    this.rejectUnsafeLegacyBodyUpdate(
      dto.body,
      dto.contentBlocks,
      old.contentBlocks,
    );
    const content =
      dto.body !== undefined || dto.contentBlocks !== undefined
        ? await this.normalizedBlocks(dto.body, dto.contentBlocks, true)
        : undefined;
    const courseId = dto.courseId ?? old.courseId;
    const bankId = dto.bankId ?? old.bankId;
    if (dto.courseId !== undefined || dto.placements !== undefined) {
      if (
        old.status !== QuestionStatus.DRAFT &&
        old.status !== QuestionStatus.REJECTED
      )
        throw new ConflictException(
          'Question scope can be changed only while draft or rejected',
        );
      if (dto.courseId !== undefined && !dto.placements)
        throw new BadRequestException(
          'Changing a question course requires replacement placements',
        );
      await this.course(courseId);
    }
    const [placements, contexts] = await Promise.all([
      dto.placements ? this.placementData(courseId, dto.placements) : undefined,
      dto.contextIds !== undefined
        ? this.contextLinks(dto.contextIds)
        : undefined,
    ]);
    await Promise.all([
      this.source(dto.sourceId ?? old.sourceId),
      this.bank(bankId),
    ]);
    await this.assertBankCourseSubject(bankId, courseId);
    const answerOrigin =
      dto.answerOrigin === undefined ? undefined : dto.answerOrigin;
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          bankId: dto.bankId,
          sourceId: dto.sourceId,
          courseId: dto.courseId,
          type: dto.type,
          body: content?.body,
          ...(content
            ? {
                contentBlocks: {
                  deleteMany: {},
                  ...this.blockCreate(content.rows),
                },
              }
            : {}),
          explanation:
            dto.explanation !== undefined
              ? dto.explanation === null
                ? null
                : dto.explanation.trim()
              : dto.structuredExplanation
                ? this.renderExplanation(dto.structuredExplanation)
                : undefined,
          maxPoints: dto.maxPoints,
          ...(dto.acceptedAnswers !== undefined
            ? {
                acceptedAnswers: dto.acceptedAnswers?.map((answer) =>
                  answer.trim(),
                ) as any,
              }
            : {}),
          ...(dto.gradingRubric !== undefined
            ? { gradingRubric: dto.gradingRubric?.trim() ?? null }
            : {}),
          answerOrigin,
          ...(answerOrigin === QuestionAnswerProvenance.HUMAN_REVIEWED
            ? { answerReviewedAt: new Date(), answerReviewedById: actor.id }
            : {}),
          updatedById: actor.id,
          ...(placements
            ? { placements: { deleteMany: {}, create: placements } }
            : {}),
          ...(contexts
            ? { contexts: { deleteMany: {}, create: contexts } }
            : {}),
          ...(dto.structuredExplanation
            ? {
                structuredExplanation: {
                  upsert: {
                    create: {
                      ...dto.structuredExplanation,
                      origin: QuestionExplanationOrigin.HUMAN,
                    },
                    update: {
                      ...dto.structuredExplanation,
                      origin: QuestionExplanationOrigin.HUMAN,
                      model: null,
                      confidence: null,
                      answerOrigin: null,
                      warnings: Prisma.JsonNull,
                    },
                  },
                },
              }
            : {}),
        },
      });
      if (content) await this.syncQuestionAssets(tx, id, content.rows);
    });
    await this.log(actor, 'QUESTION_UPDATED', 'Question', id);
    return this.getQuestion(actor, id);
  }

  async createContext(actor: RequestUser, dto: CreateQuestionContextDto) {
    this.admin(actor);
    const content = await this.normalizedBlocks(dto.body, dto.contentBlocks);
    const item = await this.prisma.questionContext.create({
      data: {
        type: dto.type,
        title: dto.title?.trim(),
        body: content.body,
        languageCode: dto.languageCode ?? 'ar',
        contentBlocks: this.blockCreate(content.rows),
      },
    });
    await this.log(
      actor,
      'QUESTION_CONTEXT_CREATED',
      'QuestionContext',
      item.id,
    );
    return this.prisma.questionContext.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        contentBlocks: {
          include: { asset: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }
  async listContexts(actor: RequestUser) {
    this.admin(actor);
    return this.prisma.questionContext.findMany({
      include: {
        contentBlocks: {
          include: { asset: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  async updateContext(
    actor: RequestUser,
    id: string,
    dto: UpdateQuestionContextDto,
  ) {
    this.admin(actor);
    const existing = await this.prisma.questionContext.findUnique({
      where: { id },
      include: { contentBlocks: true },
    });
    if (!existing) throw new NotFoundException('Question context not found');
    this.rejectUnsafeLegacyBodyUpdate(
      dto.body,
      dto.contentBlocks,
      existing.contentBlocks,
    );
    const content =
      dto.body !== undefined || dto.contentBlocks !== undefined
        ? await this.normalizedBlocks(dto.body, dto.contentBlocks, true)
        : undefined;
    const item = await this.prisma.questionContext.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title?.trim(),
        body: content?.body,
        languageCode: dto.languageCode,
        ...(content
          ? {
              contentBlocks: {
                deleteMany: {},
                ...this.blockCreate(content.rows),
              },
            }
          : {}),
      },
    });
    await this.log(actor, 'QUESTION_CONTEXT_UPDATED', 'QuestionContext', id);
    return this.prisma.questionContext.findUniqueOrThrow({
      where: { id: item.id },
      include: {
        contentBlocks: {
          include: { asset: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }
  async deleteContext(actor: RequestUser, id: string) {
    this.admin(actor);
    if (
      await this.prisma.questionContextQuestion.count({
        where: { contextId: id },
      })
    )
      throw new ConflictException('Referenced context cannot be deleted');
    await this.prisma.questionContext.delete({ where: { id } });
    await this.log(actor, 'QUESTION_CONTEXT_DELETED', 'QuestionContext', id);
    return { id, deleted: true };
  }
  private async validate(
    question: Awaited<ReturnType<QuestionBanksService['question']>>,
  ) {
    if (
      !question.body.trim() ||
      !question.explanation?.trim() ||
      question.maxPoints < 1
    )
      throw new ConflictException(
        'Question body, explanation, and positive maxPoints are required',
      );
    if (
      question.source.status !== ContentStatus.PUBLISHED ||
      question.bank.status !== ContentStatus.PUBLISHED
    )
      throw new ConflictException('Question source and bank must be published');
    const choice =
      question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.MULTIPLE_CHOICE;
    const correct = question.options.filter((x) => x.isCorrect).length;
    if (
      choice &&
      (question.options.length < 2 ||
        correct < 1 ||
        (question.type === QuestionType.SINGLE_CHOICE && correct !== 1) ||
        (question.type === QuestionType.MULTIPLE_CHOICE && correct < 2))
    )
      throw new ConflictException(
        'Question options do not satisfy its answer type',
      );
    if (!choice && question.options.length)
      throw new ConflictException('Written questions cannot have options');
    if (
      (question.type === QuestionType.SHORT_ANSWER ||
        question.type === QuestionType.FILL_IN_THE_BLANK) &&
      (!Array.isArray(question.acceptedAnswers) ||
        !question.acceptedAnswers.length)
    )
      throw new ConflictException(
        'Short and fill-in questions require accepted answers',
      );
    if (
      question.type === QuestionType.LONG_ANSWER &&
      !question.gradingRubric?.trim()
    )
      throw new ConflictException(
        'Long-answer questions require a grading rubric',
      );
    if (question.answerOrigin === QuestionAnswerProvenance.AI_INFERRED)
      throw new ConflictException(
        'AI-inferred answers must be human-reviewed before publication',
      );
    if (!question.placements.length)
      throw new ConflictException('Question requires a placement');
    if (
      [
        question.course,
        question.course.subject,
        question.course.subject.academicGrade,
      ].some((node: any) => node.status !== ContentStatus.PUBLISHED)
    )
      throw new ConflictException('Question course ancestry must be published');
    for (const reference of question.assets)
      if (
        reference.asset.status !== AssetStatus.READY ||
        !QuestionBanksService.LEGACY_ATTACHMENT_KINDS.includes(
          reference.asset.kind,
        )
      )
        throw new ConflictException(
          'Question attachments must be ready compatible assets',
        );
    const blockGroups = [
      question.contentBlocks,
      ...question.options.map((option) => option.contentBlocks),
      ...question.contexts.map((link) => link.context.contentBlocks),
    ];
    for (const blocks of blockGroups)
      for (const block of blocks) {
        if (!block.assetId) continue;
        const asset = block.asset;
        if (!asset || asset.status !== AssetStatus.READY)
          throw new ConflictException('Content block asset must be ready');
        if (
          block.type === QuestionContentBlockType.IMAGE &&
          asset.kind !== AssetKind.IMAGE
        )
          throw new ConflictException('Image blocks require an image asset');
        if (
          block.type === QuestionContentBlockType.ASSET &&
          !QuestionBanksService.ASSET_BLOCK_KINDS.includes(asset.kind)
        )
          throw new ConflictException('Content block asset is incompatible');
        if (
          asset.kind === AssetKind.VIDEO &&
          asset.video?.processingStatus !== VideoProcessingStatus.READY
        )
          throw new ConflictException('Content block video must be ready');
      }
    const link = question.videoLink;
    if (link) {
      const asset = link.videoAsset.asset;
      if (
        asset.status !== AssetStatus.READY ||
        asset.kind !== AssetKind.VIDEO ||
        link.videoAsset.processingStatus !== VideoProcessingStatus.READY
      )
        throw new ConflictException('Question video must be ready');
      const duration = link.videoAsset.durationSeconds;
      if (duration != null && link.timestampSeconds >= duration)
        throw new ConflictException(
          'Question video timestamp is outside the video duration',
        );
    }
  }
  async submit(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.question(id);
    if (
      item.status !== QuestionStatus.DRAFT &&
      item.status !== QuestionStatus.REJECTED
    )
      throw new ConflictException(
        'Only draft or rejected questions can be submitted',
      );
    await this.validate(item);
    await this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.IN_REVIEW,
        reviewNote: null,
        reviewedAt: null,
        reviewedById: null,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_SUBMITTED_FOR_REVIEW', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async publishQuestion(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.question(id);
    if (item.status !== QuestionStatus.IN_REVIEW)
      throw new ConflictException('Only questions in review can be published');
    await this.validate(item);
    await this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.PUBLISHED,
        publishedAt: new Date(),
        archivedAt: null,
        reviewedAt: new Date(),
        reviewedById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_PUBLISHED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async rejectQuestion(actor: RequestUser, id: string, reviewNote: string) {
    this.admin(actor);
    const item = await this.question(id);
    if (item.status !== QuestionStatus.IN_REVIEW)
      throw new ConflictException('Only questions in review can be rejected');
    await this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.REJECTED,
        reviewNote: reviewNote.trim(),
        reviewedAt: new Date(),
        reviewedById: actor.id,
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_REJECTED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async archiveQuestion(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.question(id);
    if (item.status === QuestionStatus.ARCHIVED)
      throw new ConflictException('Question is already archived');
    await this.prisma.question.update({
      where: { id },
      data: {
        status: QuestionStatus.ARCHIVED,
        archivedAt: new Date(),
        updatedById: actor.id,
      },
    });
    await this.log(actor, 'QUESTION_ARCHIVED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async deleteQuestion(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.question(id);
    if (
      item.status !== QuestionStatus.DRAFT ||
      item.options.length ||
      item.assets.length ||
      item.videoLink
    )
      throw new ConflictException(
        'Only an unreferenced draft question can be deleted',
      );
    await this.prisma.question.delete({ where: { id } });
    await this.log(actor, 'QUESTION_DELETED', 'Question', id);
    return { id, deleted: true };
  }
  async addOption(
    actor: RequestUser,
    id: string,
    dto: CreateQuestionOptionDto,
  ) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const content = await this.normalizedBlocks(dto.body, dto.contentBlocks);
    const created = await this.prisma.questionOption.create({
      data: {
        questionId: id,
        body: content.body,
        contentBlocks: this.blockCreate(content.rows),
        isCorrect: dto.isCorrect ?? false,
        sortOrder: item.options.length + 1,
      },
    });
    await this.log(actor, 'QUESTION_OPTION_ADDED', 'Question', id, {
      optionId: created.id,
    });
    return this.getQuestion(actor, id);
  }
  async updateOption(
    actor: RequestUser,
    id: string,
    optionId: string,
    dto: UpdateQuestionOptionDto,
  ) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const option = await this.prisma.questionOption.findFirst({
      where: { id: optionId, questionId: id },
      include: { contentBlocks: true },
    });
    if (!option) throw new NotFoundException('Question option not found');
    this.rejectUnsafeLegacyBodyUpdate(
      dto.body,
      dto.contentBlocks,
      option.contentBlocks,
    );
    const content =
      dto.body !== undefined || dto.contentBlocks !== undefined
        ? await this.normalizedBlocks(dto.body, dto.contentBlocks, true)
        : undefined;
    await this.prisma.questionOption.update({
      where: { id: optionId },
      data: {
        body: content?.body,
        isCorrect: dto.isCorrect,
        ...(content
          ? {
              contentBlocks: {
                deleteMany: {},
                ...this.blockCreate(content.rows),
              },
            }
          : {}),
      },
    });
    await this.log(actor, 'QUESTION_OPTION_UPDATED', 'Question', id, {
      optionId,
    });
    return this.getQuestion(actor, id);
  }
  async deleteOption(actor: RequestUser, id: string, optionId: string) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const option = await this.prisma.questionOption.findFirst({
      where: { id: optionId, questionId: id },
    });
    if (!option) throw new NotFoundException('Question option not found');
    await this.prisma.$transaction([
      this.prisma.questionOption.delete({ where: { id: optionId } }),
      this.prisma.questionOption.updateMany({
        where: { questionId: id, sortOrder: { gt: option.sortOrder } },
        data: { sortOrder: { decrement: 1 } },
      }),
    ]);
    await this.log(actor, 'QUESTION_OPTION_DELETED', 'Question', id, {
      optionId,
    });
    return this.getQuestion(actor, id);
  }
  async reorderOptions(actor: RequestUser, id: string, optionIds: string[]) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    if (
      item.options.length !== optionIds.length ||
      new Set(optionIds).size !== optionIds.length ||
      item.options.some((x) => !optionIds.includes(x.id))
    )
      throw new BadRequestException(
        'optionIds must contain every option exactly once',
      );
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < item.options.length; i++)
        await tx.questionOption.update({
          where: { id: item.options[i].id },
          data: { sortOrder: 1000000 + i },
        });
      for (let i = 0; i < optionIds.length; i++)
        await tx.questionOption.update({
          where: { id: optionIds[i] },
          data: { sortOrder: i + 1 },
        });
    });
    await this.log(actor, 'QUESTION_OPTIONS_REORDERED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async addAsset(actor: RequestUser, id: string, assetId: string) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const attachmentKinds: AssetKind[] = [
      AssetKind.IMAGE,
      AssetKind.PDF,
      AssetKind.DOCUMENT,
    ];
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });
    if (
      !asset ||
      asset.status !== AssetStatus.READY ||
      !attachmentKinds.includes(asset.kind)
    )
      throw new ConflictException(
        'Attachment must be a ready image, PDF, or document',
      );
    await this.prisma.$transaction([
      this.prisma.questionAsset.create({
        data: { questionId: id, assetId, sortOrder: item.assets.length + 1 },
      }),
      this.prisma.questionContentBlock.create({
        data: {
          questionId: id,
          type:
            asset.kind === AssetKind.IMAGE
              ? QuestionContentBlockType.IMAGE
              : QuestionContentBlockType.ASSET,
          assetId,
          sortOrder: item.contentBlocks.length + 1,
        },
      }),
    ]);
    await this.log(actor, 'QUESTION_ASSET_ADDED', 'Question', id, { assetId });
    return this.getQuestion(actor, id);
  }
  async removeAsset(actor: RequestUser, id: string, assetId: string) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const ref = await this.prisma.questionAsset.findUnique({
      where: { questionId_assetId: { questionId: id, assetId } },
    });
    if (!ref) throw new NotFoundException('Question attachment not found');
    await this.prisma.$transaction([
      this.prisma.questionAsset.delete({ where: { id: ref.id } }),
      this.prisma.questionAsset.updateMany({
        where: { questionId: id, sortOrder: { gt: ref.sortOrder } },
        data: { sortOrder: { decrement: 1 } },
      }),
      this.prisma.questionContentBlock.deleteMany({
        where: { questionId: id, assetId },
      }),
    ]);
    await this.log(actor, 'QUESTION_ASSET_REMOVED', 'Question', id, {
      assetId,
    });
    return this.getQuestion(actor, id);
  }
  async reorderAssets(actor: RequestUser, id: string, assetIds: string[]) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    if (
      item.assets.length !== assetIds.length ||
      new Set(assetIds).size !== assetIds.length ||
      item.assets.some((x) => !assetIds.includes(x.assetId))
    )
      throw new BadRequestException(
        'assetIds must contain every attachment exactly once',
      );
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < item.assets.length; i++)
        await tx.questionAsset.update({
          where: { id: item.assets[i].id },
          data: { sortOrder: 1000000 + i },
        });
      for (let i = 0; i < assetIds.length; i++)
        await tx.questionAsset.update({
          where: {
            questionId_assetId: { questionId: id, assetId: assetIds[i] },
          },
          data: { sortOrder: i + 1 },
        });
      const mediaBlocks = item.contentBlocks.filter(
        (block) =>
          block.assetId &&
          block.asset &&
          QuestionBanksService.LEGACY_ATTACHMENT_KINDS.includes(
            block.asset.kind,
          ),
      );
      if (mediaBlocks.length === assetIds.length) {
        for (let i = 0; i < mediaBlocks.length; i++)
          await tx.questionContentBlock.update({
            where: { id: mediaBlocks[i].id },
            data: { sortOrder: 2000000 + i },
          });
        const originalSlots = mediaBlocks.map((block) => block.sortOrder);
        for (let i = 0; i < assetIds.length; i++) {
          const block = mediaBlocks.find(
            (candidate) => candidate.assetId === assetIds[i],
          );
          if (block)
            await tx.questionContentBlock.update({
              where: { id: block.id },
              data: { sortOrder: originalSlots[i] },
            });
        }
      }
    });
    await this.log(actor, 'QUESTION_ASSETS_REORDERED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  async setVideo(actor: RequestUser, id: string, dto: SetQuestionVideoLinkDto) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    const asset = await this.prisma.asset.findUnique({
      where: { id: dto.videoAssetId },
      include: { video: true },
    });
    if (
      !asset ||
      asset.kind !== AssetKind.VIDEO ||
      asset.status !== AssetStatus.READY ||
      asset.video?.processingStatus !== VideoProcessingStatus.READY
    )
      throw new ConflictException('Video must be ready');
    if (
      asset.video.durationSeconds != null &&
      dto.timestampSeconds >= asset.video.durationSeconds
    )
      throw new BadRequestException(
        'Video timestamp is outside the video duration',
      );
    await this.prisma.questionVideoLink.upsert({
      where: { questionId: id },
      create: {
        questionId: id,
        videoAssetId: dto.videoAssetId,
        timestampSeconds: dto.timestampSeconds,
      },
      update: {
        videoAssetId: dto.videoAssetId,
        timestampSeconds: dto.timestampSeconds,
      },
    });
    await this.log(actor, 'QUESTION_VIDEO_SET', 'Question', id, {
      videoAssetId: dto.videoAssetId,
    });
    return this.getQuestion(actor, id);
  }
  async removeVideo(actor: RequestUser, id: string) {
    this.admin(actor);
    const item = await this.question(id);
    this.editable(item.status);
    await this.prisma.questionVideoLink.deleteMany({
      where: { questionId: id },
    });
    await this.log(actor, 'QUESTION_VIDEO_REMOVED', 'Question', id);
    return this.getQuestion(actor, id);
  }
  private bankDto(x: any) {
    return { ...x, subjectName: x.subject?.title ?? null };
  }
  private sourceDto(x: any) {
    const { titleAr, titleEn, noteAr, noteEn, publisher, ...rest } = x;
    return {
      ...rest,
      publisherName: publisher?.displayName ?? null,
      title: { ar: titleAr, en: titleEn },
      note: { ar: noteAr, en: noteEn },
    };
  }
  private adminDto(x: any) {
    return {
      ...x,
      bankName: x.bank?.title ?? null,
      ...(x.source ? { source: this.sourceDto(x.source) } : {}),
      scope: {
        courseId: x.courseId,
        courseName: x.course?.title ?? null,
        subjectId: x.course?.subjectId,
        subjectName: x.course?.subject?.title ?? null,
        academicGradeId: x.course?.subject?.academicGradeId,
        academicGradeName: x.course?.subject?.academicGrade
          ? {
              ar: x.course.subject.academicGrade.titleAr,
              en: x.course.subject.academicGrade.titleEn,
            }
          : null,
      },
      placements: (x.placements ?? []).map((placement: any) => ({
        courseId: placement.courseId,
        courseName: placement.course?.title ?? null,
        chapterId: placement.chapterId,
        chapterName: placement.chapter?.title ?? null,
        lessonId: placement.lessonId,
        lessonName: placement.lesson?.title ?? null,
        sectionId: placement.sectionId,
        sectionName: placement.section?.title ?? null,
      })),
    };
  }
}
