import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AssetKind, CommerceTargetType, ContentStatus, EntitlementSource, EntitlementStatus, ManualPaymentSubmissionStatus, OrderStatus, Role } from '../../common/types/roles.enum';
import { toPaginationMeta, type PaginationQueryDto, type SearchPaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { RequestUser } from '../../common/types/request-with-user.types';
import { PrismaService } from '../../database/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { AuditService } from '../audit/audit.service';
import { paginateArabicSearch } from '../../common/search/arabic-search';
import type { CartTargetDto, CheckoutDto, CreatePaymentMethodDto, PaymentSubmissionQueryDto, RejectPaymentDto, UpdatePaymentMethodDto } from './dto/commerce.dto';

type Target = { targetType: CommerceTargetType; courseId?: string; chapterId?: string; title: string; priceMinor: number; currency: string; courseForCoverage: string };
const published = ContentStatus.PUBLISHED;

@Injectable()
export class CommerceService {
  constructor(private readonly prisma: PrismaService, private readonly assets: AssetsService, private readonly audit: AuditService) {}
  private admin(actor: RequestUser) { if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Forbidden'); }
  private assertIdempotencyKey(key: string) {
    if (!key?.trim())
      throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 200)
      throw new BadRequestException(
        'Idempotency-Key header must not exceed 200 characters',
      );
  }
  private async studentGrade(studentUserId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: studentUserId }, select: { academicGradeId: true } });
    if (!profile?.academicGradeId) throw new ConflictException('Student academic grade is required');
    return profile.academicGradeId;
  }
  private async target(studentUserId: string, dto: CartTargetDto): Promise<Target> {
    const gradeId = await this.studentGrade(studentUserId);
    if (dto.targetType === CommerceTargetType.COURSE) {
      const course = await this.prisma.course.findFirst({ where: { id: dto.targetId, status: published, subject: { academicGradeId: gradeId, status: published, academicGrade: { status: published } } } });
      if (!course) throw new NotFoundException('Purchasable course not found');
      if (!course.isPurchasable || course.currency !== 'EGP' || course.priceMinor === null) throw new ConflictException('Course is not purchasable');
      return { targetType: dto.targetType, courseId: course.id, title: course.title, priceMinor: course.priceMinor, currency: course.currency, courseForCoverage: course.id };
    }
    const chapter = await this.prisma.chapter.findFirst({ where: { id: dto.targetId, status: published, course: { status: published, subject: { academicGradeId: gradeId, status: published, academicGrade: { status: published } } } }, include: { course: true } });
    if (!chapter) throw new NotFoundException('Purchasable chapter not found');
    const pricing = chapter.isPurchasable === null ? chapter.course : chapter;
    if (!pricing.isPurchasable || pricing.currency !== 'EGP' || pricing.priceMinor === null) throw new ConflictException('Chapter is not purchasable');
    return { targetType: dto.targetType, chapterId: chapter.id, title: chapter.title, priceMinor: pricing.priceMinor, currency: pricing.currency, courseForCoverage: chapter.courseId };
  }
  private async assertNotEntitled(studentUserId: string, target: Target) {
    const now = new Date(); const grant = await this.prisma.studentEntitlement.findFirst({ where: { studentUserId, status: EntitlementStatus.ACTIVE, revokedAt: null, startsAt: { lte: now }, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ courseId: target.courseForCoverage }, ...(target.chapterId ? [{ chapterId: target.chapterId }] : [])] }] } });
    if (grant) throw new ConflictException('Content is already entitled');
  }
  private cartItem(item: any) { const targetName = item.course?.title ?? item.chapter?.title ?? null; return { id: item.id, targetType: item.targetType, targetId: item.courseId ?? item.chapterId, targetName, title: targetName, price: { amountMinor: item.course?.priceMinor ?? (item.chapter?.isPurchasable === null ? item.chapter.course.priceMinor : item.chapter?.priceMinor), currency: item.course?.currency ?? (item.chapter?.isPurchasable === null ? item.chapter.course.currency : item.chapter?.currency) } }; }
  private async paymentProof(studentUserId: string, assetId: string) {
    // Direct Bunny uploads remain UPLOADING until the application verifies the
    // object. Completing here keeps receipt submission atomic from the
    // student's perspective: an uploaded proof cannot be submitted before its
    // size, MIME type, and signature have been checked.
    await this.assets.completeUpload({ id: studentUserId, role: Role.STUDENT } as RequestUser, assetId);
    const asset = await this.assets.getReady(assetId);
    if (asset.kind !== AssetKind.PAYMENT_PROOF || asset.uploadedById !== studentUserId) throw new ConflictException('Payment proof must be a ready asset uploaded by the student');
    const used = await (this.prisma as any).manualPaymentSubmission.findFirst({ where: { proofAssetId: assetId }, select: { id: true } });
    if (used) throw new ConflictException('Payment proof asset has already been submitted');
    return asset;
  }

  async methods(query: SearchPaginationQueryDto) { const where = { isActive: true }; const { data, total } = await paginateArabicSearch({ prisma: this.prisma, delegate: this.prisma.manualPaymentMethod, target: 'manualPaymentMethod', q: query.q, scope: { where: Prisma.sql`t."isActive" = true` }, orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], where, args: { select: { id: true, titleAr: true, instructionsAr: true, titleEn: true, instructionsEn: true } }, page: query.page, limit: query.limit }); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
  async cart(studentUserId: string) { const cart = await this.prisma.cart.findUnique({ where: { studentUserId }, include: { items: { include: { course: true, chapter: { include: { course: true } } }, orderBy: { createdAt: 'asc' } } } }); const items = cart?.items ?? []; return { data: items.map((item) => this.cartItem(item)), total: { amountMinor: items.reduce((sum, item) => sum + (item.course?.priceMinor ?? (item.chapter?.isPurchasable === null ? item.chapter.course.priceMinor : item.chapter?.priceMinor) ?? 0), 0), currency: 'EGP' } }; }
  async addCartItem(studentUserId: string, dto: CartTargetDto) {
    const target = await this.target(studentUserId, dto); await this.assertNotEntitled(studentUserId, target);
    const cart = await this.prisma.cart.upsert({ where: { studentUserId }, create: { studentUserId }, update: {} });
    const existing = await this.prisma.cartItem.findMany({ where: { cartId: cart.id }, include: { chapter: true } });
    if (existing.some((x) => x.courseId === target.courseId || x.chapterId === target.chapterId || (target.courseId && x.chapter?.courseId === target.courseId) || (target.chapterId && x.courseId === target.courseForCoverage))) throw new ConflictException('Cart already contains overlapping content');
    try { const item = await this.prisma.cartItem.create({ data: { cartId: cart.id, targetType: target.targetType, courseId: target.courseId, chapterId: target.chapterId }, include: { course: true, chapter: { include: { course: true } } } }); return this.cartItem(item); } catch (error: any) { if (error.code === 'P2002') throw new ConflictException('Item is already in cart'); throw error; }
  }
  async removeCartItem(studentUserId: string, id: string) { const item = await this.prisma.cartItem.findFirst({ where: { id, cart: { studentUserId } } }); if (!item) throw new NotFoundException('Cart item not found'); await this.prisma.cartItem.delete({ where: { id } }); return { id, deleted: true }; }
  private snapshot(method: any) { return { titleAr: method.titleAr, instructionsAr: method.instructionsAr, titleEn: method.titleEn, instructionsEn: method.instructionsEn }; }
  async checkout(studentUserId: string, dto: CheckoutDto, key: string) {
    this.assertIdempotencyKey(key);
    const prior = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation: 'CHECKOUT', key } } });
    if (prior) return this.order(studentUserId, prior.resourceId);
    const method = await this.prisma.manualPaymentMethod.findFirst({ where: { id: dto.manualPaymentMethodId, isActive: true } }); if (!method) throw new NotFoundException('Active payment method not found');
    const cart = await this.prisma.cart.findUnique({ where: { studentUserId }, include: { items: true } }); if (!cart?.items.length) throw new ConflictException('Cart is empty');
    const targets = await Promise.all(cart.items.map((x) => this.target(studentUserId, { targetType: x.targetType, targetId: x.courseId ?? x.chapterId! })));
    await Promise.all(targets.map((x) => this.assertNotEntitled(studentUserId, x)));
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({ data: { studentUserId, manualPaymentMethodId: method.id, paymentMethodSnapshot: this.snapshot(method), totalMinor: targets.reduce((n, x) => n + x.priceMinor, 0), currency: 'EGP', items: { create: targets.map((x) => ({ targetType: x.targetType, courseId: x.courseId, chapterId: x.chapterId, titleSnapshot: x.title, priceMinor: x.priceMinor, currency: x.currency })) } }, include: { items: true } });
        // Remove only the snapshot that was purchased. A concurrently added
        // cart item must survive this checkout.
        await tx.cartItem.deleteMany({
          where: { id: { in: cart.items.map((item) => item.id) } },
        });
        await tx.commerceIdempotencyKey.create({ data: { studentUserId, operation: 'CHECKOUT', key, resourceId: created.id } }); return created;
      }, { isolationLevel: 'Serializable' });
      await this.audit.record({ actorUserId: studentUserId, action: 'ORDER_CREATED', targetType: 'Order', targetId: order.id }); return this.order(studentUserId, order.id);
    } catch (error: any) { if (error.code === 'P2002') { const saved = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation: 'CHECKOUT', key } } }); if (saved) return this.order(studentUserId, saved.resourceId); } throw error; }
  }
  private orderDto(order: any) { return { id: order.id, status: order.status, total: { amountMinor: order.totalMinor, currency: order.currency }, paymentMethod: order.paymentMethodSnapshot, createdAt: order.createdAt, approvedAt: order.approvedAt, cancelledAt: order.cancelledAt, items: order.items.map((x: any) => ({ id: x.id, targetType: x.targetType, targetId: x.courseId ?? x.chapterId, targetName: x.titleSnapshot, title: x.titleSnapshot, price: { amountMinor: x.priceMinor, currency: x.currency } })), submissions: order.submissions?.map((x: any) => ({ id: x.id, status: x.status, transactionReference: x.transactionReference, note: x.note, rejectionReason: x.rejectionReason, createdAt: x.createdAt, reviewedAt: x.reviewedAt })) ?? [] }; }
  async orders(studentUserId: string, query: PaginationQueryDto) { const where = { studentUserId }; const [data, total] = await this.prisma.$transaction([this.prisma.order.findMany({ where, include: { items: true, submissions: { orderBy: { createdAt: 'desc' } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.order.count({ where })]); return { data: data.map((x) => this.orderDto(x)), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async order(studentUserId: string, id: string) { const order = await this.prisma.order.findFirst({ where: { id, studentUserId }, include: { items: true, submissions: { orderBy: { createdAt: 'desc' } } } }); if (!order) throw new NotFoundException('Order not found'); return this.orderDto(order); }
  async cancel(studentUserId: string, id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, studentUserId } });
    if (!order) throw new NotFoundException('Order not found');
    const cancelled = await this.prisma.order.updateMany({
      where: {
        id,
        studentUserId,
        status: { in: [OrderStatus.AWAITING_PAYMENT, OrderStatus.REJECTED] },
      },
      data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (cancelled.count !== 1)
      throw new ConflictException('Order cannot be cancelled');
    await this.audit.record({ actorUserId: studentUserId, action: 'ORDER_CANCELLED', targetType: 'Order', targetId: id });
    return this.order(studentUserId, id);
  }
  async authorizeProofUpload(studentUserId: string, orderId: string, key: string, data: { filename: string; mimeType: string; transactionReference?: string; note?: string }) {
    this.assertIdempotencyKey(key); if (data.transactionReference && data.transactionReference.length > 200) throw new BadRequestException('transactionReference must not exceed 200 characters');
    const order = await this.prisma.order.findFirst({ where: { id: orderId, studentUserId } }); if (!order) throw new NotFoundException('Order not found'); if (order.status !== OrderStatus.AWAITING_PAYMENT) throw new ConflictException('Order cannot accept an initial payment proof');
    return this.assets.authorizePaymentProof({ id: studentUserId, role: Role.STUDENT } as RequestUser, data);
  }
  async authorizeResubmitProofUpload(studentUserId: string, orderId: string, submissionId: string, key: string, data: { filename: string; mimeType: string; transactionReference?: string; note?: string }) {
    this.assertIdempotencyKey(key); if (data.transactionReference && data.transactionReference.length > 200) throw new BadRequestException('transactionReference must not exceed 200 characters');
    const rejected = await this.prisma.manualPaymentSubmission.findFirst({ where: { id: submissionId, orderId, status: ManualPaymentSubmissionStatus.REJECTED, order: { studentUserId, status: OrderStatus.REJECTED } } }); if (!rejected) throw new ConflictException('Payment submission is not eligible for resubmission');
    return this.assets.authorizePaymentProof({ id: studentUserId, role: Role.STUDENT } as RequestUser, data);
  }
  async submitProof(studentUserId: string, orderId: string, key: string, data: { assetId: string; transactionReference?: string; note?: string }) {
    this.assertIdempotencyKey(key); if (!data.assetId?.trim()) throw new BadRequestException('assetId is required'); if (data.transactionReference && data.transactionReference.length > 200) throw new BadRequestException('transactionReference must not exceed 200 characters');
    const previous = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation: `PROOF:${orderId}`, key } } }); if (previous) return { id: previous.resourceId };
    const order = await this.prisma.order.findFirst({ where: { id: orderId, studentUserId } }); if (!order) throw new NotFoundException('Order not found'); if (order.status !== OrderStatus.AWAITING_PAYMENT) throw new ConflictException('Order cannot accept an initial payment proof');
    const proof = await this.paymentProof(studentUserId, data.assetId);
    try { const submission = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: orderId, studentUserId, status: OrderStatus.AWAITING_PAYMENT }, data: { status: OrderStatus.SUBMITTED } });
      if (claimed.count !== 1) throw new ConflictException('Order cannot accept an initial payment proof');
      const created = await tx.manualPaymentSubmission.create({ data: { orderId, proofAssetId: proof.id, transactionReference: data.transactionReference?.trim() || null, note: data.note?.trim() || null } });
      await tx.commerceIdempotencyKey.create({ data: { studentUserId, operation: `PROOF:${orderId}`, key, resourceId: created.id } }); return created;
    }); await this.audit.record({ actorUserId: studentUserId, action: 'MANUAL_PAYMENT_SUBMITTED', targetType: 'ManualPaymentSubmission', targetId: submission.id, metadata: { orderId } }); return { id: submission.id, status: submission.status }; } catch (error: any) { if (error.code === 'P2002') { const saved = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation: `PROOF:${orderId}`, key } } }); if (saved) return { id: saved.resourceId }; } throw error; }
  }
  async resubmitProof(studentUserId: string, orderId: string, submissionId: string, key: string, data: { assetId: string; transactionReference?: string; note?: string }) {
    this.assertIdempotencyKey(key); if (!data.assetId?.trim()) throw new BadRequestException('assetId is required'); if (data.transactionReference && data.transactionReference.length > 200) throw new BadRequestException('transactionReference must not exceed 200 characters');
    const operation = `RESUBMIT:${submissionId}`;
    const previous = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation, key } } }); if (previous) return { id: previous.resourceId, status: ManualPaymentSubmissionStatus.SUBMITTED };
    const rejected = await this.prisma.manualPaymentSubmission.findFirst({ where: { id: submissionId, orderId, status: ManualPaymentSubmissionStatus.REJECTED, order: { studentUserId, status: OrderStatus.REJECTED } } });
    if (!rejected) throw new ConflictException('Payment submission is not eligible for resubmission');
    const proof = await this.paymentProof(studentUserId, data.assetId);
    try { const submission = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: orderId, studentUserId, status: OrderStatus.REJECTED }, data: { status: OrderStatus.SUBMITTED } });
      if (claimed.count !== 1) throw new ConflictException('Payment submission is not eligible for resubmission');
      const current = await tx.manualPaymentSubmission.findFirst({ where: { id: submissionId, orderId, status: ManualPaymentSubmissionStatus.REJECTED } });
      if (!current) throw new ConflictException('Payment submission is not eligible for resubmission');
      const created = await tx.manualPaymentSubmission.create({ data: { orderId, proofAssetId: proof.id, transactionReference: data.transactionReference?.trim() || null, note: data.note?.trim() || null } });
      await tx.commerceIdempotencyKey.create({ data: { studentUserId, operation, key, resourceId: created.id } }); return created;
    }, { isolationLevel: 'Serializable' });
    await this.audit.record({ actorUserId: studentUserId, action: 'MANUAL_PAYMENT_RESUBMITTED', targetType: 'ManualPaymentSubmission', targetId: submission.id, metadata: { orderId, replacedSubmissionId: submissionId } }); return { id: submission.id, status: submission.status };
    } catch (error: any) { if (error.code === 'P2002') { const saved = await this.prisma.commerceIdempotencyKey.findUnique({ where: { studentUserId_operation_key: { studentUserId, operation, key } } }); if (saved) return { id: saved.resourceId, status: ManualPaymentSubmissionStatus.SUBMITTED }; } throw error; }
  }
  async methodsAdmin(actor: RequestUser, query: SearchPaginationQueryDto) { this.admin(actor); const { data, total } = await paginateArabicSearch({ prisma: this.prisma, delegate: this.prisma.manualPaymentMethod, target: 'manualPaymentMethod', q: query.q, orderBySql: Prisma.sql`t."sortOrder" ASC, t.id ASC`, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], where: {}, page: query.page, limit: query.limit }); return { data, meta: toPaginationMeta(query.page, query.limit, total) }; }
  async createMethod(actor: RequestUser, dto: CreatePaymentMethodDto) {
    this.admin(actor);
    const method = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122401)`;
      const max = await tx.manualPaymentMethod.aggregate({
        _max: { sortOrder: true },
      });
      return tx.manualPaymentMethod.create({
        data: {
          ...dto,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          createdById: actor.id,
        },
      });
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'MANUAL_PAYMENT_METHOD_CREATED',
      targetType: 'ManualPaymentMethod',
      targetId: method.id,
    });
    return method;
  }
  async updateMethod(actor: RequestUser, id: string, dto: UpdatePaymentMethodDto) { this.admin(actor); const method = await this.prisma.manualPaymentMethod.update({ where: { id }, data: dto }); await this.audit.record({ actorUserId: actor.id, action: 'MANUAL_PAYMENT_METHOD_UPDATED', targetType: 'ManualPaymentMethod', targetId: id }); return method; }
  async reorderMethods(actor: RequestUser, ids: string[]) {
    this.admin(actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73122401)`;
      const methods = await tx.manualPaymentMethod.findMany({
        select: { id: true, sortOrder: true },
      });
      if (
        ids.length !== methods.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !methods.some((method) => method.id === id))
      )
        throw new BadRequestException(
          'Provide every payment method exactly once',
        );
      const temporaryOrderStart =
        Math.max(0, ...methods.map((method) => method.sortOrder)) + 1;
      for (const [index, id] of ids.entries())
        await tx.manualPaymentMethod.update({
          where: { id },
          data: { sortOrder: temporaryOrderStart + index },
        });
      for (const [index, id] of ids.entries())
        await tx.manualPaymentMethod.update({
          where: { id },
          data: { sortOrder: index + 1 },
        });
    });
    return {
      data: await this.prisma.manualPaymentMethod.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    };
  }
  async submissions(actor: RequestUser, query: PaymentSubmissionQueryDto) { this.admin(actor); const where = { ...(query.status ? { status: query.status } : {}), ...(query.studentUserId ? { order: { studentUserId: query.studentUserId } } : {}) }; const [data, total] = await this.prisma.$transaction([this.prisma.manualPaymentSubmission.findMany({ where, include: { order: { include: { student: true, items: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.prisma.manualPaymentSubmission.count({ where })]); return { data: data.map((x) => ({ id: x.id, status: x.status, transactionReference: x.transactionReference, orderId: x.orderId, orderStatus: x.order.status, studentUserId: x.order.studentUserId, studentName: x.order.student.fullName, total: { amountMinor: x.order.totalMinor, currency: x.order.currency }, createdAt: x.createdAt })), meta: toPaginationMeta(query.page, query.limit, total) }; }
  async submission(actor: RequestUser, id: string) { this.admin(actor); const item = await this.prisma.manualPaymentSubmission.findUnique({ where: { id }, include: { proofAsset: true, order: { include: { items: true } } } }); if (!item) throw new NotFoundException('Payment submission not found'); return { id: item.id, status: item.status, transactionReference: item.transactionReference, note: item.note, rejectionReason: item.rejectionReason, createdAt: item.createdAt, reviewedAt: item.reviewedAt, order: this.orderDto({ ...item.order, submissions: [] }), proof: { id: item.proofAssetId, filename: item.proofAsset.filename, mimeType: item.proofAsset.mimeType, ...this.assets.protectedAccess(item.proofAsset) } }; }
  async approve(actor: RequestUser, id: string) {
    this.admin(actor);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const submission = await tx.manualPaymentSubmission.findUnique({ where: { id }, include: { order: { include: { items: true } } } });
      if (!submission) throw new NotFoundException('Payment submission not found');
      if (submission.status === ManualPaymentSubmissionStatus.APPROVED) return submission;
      const claimed = await tx.manualPaymentSubmission.updateMany({ where: { id, status: ManualPaymentSubmissionStatus.SUBMITTED }, data: { status: ManualPaymentSubmissionStatus.APPROVED, reviewedById: actor.id, reviewedAt: now } });
      if (claimed.count !== 1) throw new ConflictException('Payment submission cannot be approved');
      const orderClaimed = await tx.order.updateMany({ where: { id: submission.orderId, status: OrderStatus.SUBMITTED }, data: { status: OrderStatus.APPROVED, approvedAt: now } });
      if (orderClaimed.count !== 1) throw new ConflictException('Payment submission cannot be approved');
      await tx.studentEntitlement.updateMany({
        where: {
          studentUserId: submission.order.studentUserId,
          status: EntitlementStatus.ACTIVE,
          expiresAt: { lte: now },
          OR: submission.order.items.map((item) =>
            item.courseId
              ? { courseId: item.courseId }
              : { chapterId: item.chapterId },
          ),
        },
        data: {
          status: EntitlementStatus.REVOKED,
          revokedAt: now,
          revokedById: actor.id,
        },
      });
      await tx.studentEntitlement.createMany({ data: submission.order.items.map((item) => ({ studentUserId: submission.order.studentUserId, courseId: item.courseId, chapterId: item.chapterId, orderItemId: item.id, source: EntitlementSource.PAYMENT, grantedById: actor.id })) });
      await this.audit.recordWithClient(tx, { actorUserId: actor.id, action: 'MANUAL_PAYMENT_APPROVED', targetType: 'ManualPaymentSubmission', targetId: id, metadata: { orderId: submission.orderId } });
      return submission;
    }, { isolationLevel: 'Serializable' });
    return { id, status: ManualPaymentSubmissionStatus.APPROVED };
  }
  async reject(actor: RequestUser, id: string, dto: RejectPaymentDto) {
    this.admin(actor);
    const now = new Date();
    const submission = await this.prisma.$transaction(async (tx) => {
      const found = await tx.manualPaymentSubmission.findUnique({ where: { id } });
      if (!found) throw new NotFoundException('Payment submission not found');
      const claimed = await tx.manualPaymentSubmission.updateMany({ where: { id, status: ManualPaymentSubmissionStatus.SUBMITTED }, data: { status: ManualPaymentSubmissionStatus.REJECTED, reviewedById: actor.id, reviewedAt: now, rejectionReason: dto.rejectionReason.trim() } });
      if (claimed.count !== 1) throw new ConflictException('Payment submission cannot be rejected');
      const orderClaimed = await tx.order.updateMany({ where: { id: found.orderId, status: OrderStatus.SUBMITTED }, data: { status: OrderStatus.REJECTED } });
      if (orderClaimed.count !== 1) throw new ConflictException('Payment submission cannot be rejected');
      await this.audit.recordWithClient(tx, { actorUserId: actor.id, action: 'MANUAL_PAYMENT_REJECTED', targetType: 'ManualPaymentSubmission', targetId: id });
      return { ...found, status: ManualPaymentSubmissionStatus.REJECTED };
    });
    return { id: submission.id, status: submission.status };
  }
}
