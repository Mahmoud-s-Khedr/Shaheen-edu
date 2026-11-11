import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertSuperAdmin } from '../../common/authorization/admin-authorization';
import type { RequestUser } from '../../common/types/request-with-user.types';
import {
  PaginationQueryDto,
  toPaginationMeta,
} from '../../common/dto/pagination-query.dto';
import type { AdjustStudentCreditDto } from './dto/student-rewards.dto';

export class CreditUnavailableError extends ConflictException {
  constructor() {
    super('Reserved credit is no longer available');
  }
}
@Injectable()
export class StudentCreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Cron('*/5 * * * *')
  async expireCredits() {
    const accounts = await this.prisma.studentCreditGrant.findMany({
      where: { remainingMinor: { gt: 0 }, expiresAt: { lte: new Date() } },
      select: { studentUserId: true },
      distinct: ['studentUserId'],
      take: 500,
    });
    for (const account of accounts)
      await this.prisma.$transaction((tx) =>
        this.expire(tx, account.studentUserId),
      );
  }
  async lock(tx: Prisma.TransactionClient, studentUserId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`student-credit:${studentUserId}`}))`;
    return tx.studentCreditAccount.upsert({
      where: { studentUserId },
      create: { studentUserId },
      update: {},
    });
  }
  private async entry(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    key: string,
    type: string,
    amountMinor: number,
    availableDeltaMinor: number,
    reason: string,
    orderId?: string,
    actorUserId?: string,
  ) {
    return tx.studentCreditEntry.create({
      data: {
        studentUserId,
        key,
        type,
        amountMinor,
        availableDeltaMinor,
        reason,
        orderId,
        actorUserId,
      },
    });
  }
  async expire(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    now = new Date(),
  ) {
    await this.lock(tx, studentUserId);
    const grants = await tx.studentCreditGrant.findMany({
      where: {
        studentUserId,
        remainingMinor: { gt: 0 },
        expiresAt: { lte: now },
      },
    });
    for (const grant of grants) {
      await tx.studentCreditGrant.update({
        where: { id: grant.id },
        data: { remainingMinor: 0 },
      });
      await this.entry(
        tx,
        studentUserId,
        `expire:${grant.id}:${grant.expiresAt!.toISOString()}`,
        'EXPIRED',
        grant.remainingMinor,
        -grant.remainingMinor,
        'Credit expired',
      );
    }
  }
  async balanceWithClient(tx: Prisma.TransactionClient, studentUserId: string) {
    await this.expire(tx, studentUserId);
    const [account, grants, held] = await Promise.all([
      tx.studentCreditAccount.findUniqueOrThrow({ where: { studentUserId } }),
      tx.studentCreditGrant.findMany({
        where: { studentUserId, remainingMinor: { gt: 0 } },
        orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      }),
      tx.studentCreditReservation.aggregate({
        where: { studentUserId, status: 'RESERVED' },
        _sum: { amountMinor: true },
      }),
    ]);
    return {
      currency: 'EGP',
      availableMinor: grants.reduce((sum, g) => sum + g.remainingMinor, 0),
      reservedMinor: held._sum.amountMinor ?? 0,
      debtMinor: account.debtMinor,
      expiring: grants
        .filter((g) => g.expiresAt)
        .map((g) => ({
          amountMinor: g.remainingMinor,
          expiresAt: g.expiresAt,
        })),
    };
  }
  balance(studentUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.studentProfile.findUnique({
          where: { userId: studentUserId },
        }))
      )
        throw new NotFoundException('Student not found');
      return this.balanceWithClient(tx, studentUserId);
    });
  }
  async history(studentUserId: string, query: PaginationQueryDto) {
    await this.balance(studentUserId);
    const where = { studentUserId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.studentCreditEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.studentCreditEntry.count({ where }),
    ]);
    return { data, meta: toPaginationMeta(query.page, query.limit, total) };
  }
  async grant(
    tx: Prisma.TransactionClient,
    input: {
      studentUserId: string;
      sourceKey: string;
      amountMinor: number;
      reason: string;
      expiresAt?: Date | null;
      orderId?: string;
      actorUserId?: string;
    },
  ) {
    const account = await this.lock(tx, input.studentUserId);
    const existing = await tx.studentCreditGrant.findUnique({
      where: { sourceKey: input.sourceKey },
    });
    if (existing) return existing;
    const debtPaid = Math.min(account.debtMinor, input.amountMinor);
    if (debtPaid)
      await tx.studentCreditAccount.update({
        where: { studentUserId: input.studentUserId },
        data: { debtMinor: { decrement: debtPaid } },
      });
    const grant = await tx.studentCreditGrant.create({
      data: {
        studentUserId: input.studentUserId,
        sourceKey: input.sourceKey,
        amountMinor: input.amountMinor,
        remainingMinor: input.amountMinor - debtPaid,
        expiresAt: input.expiresAt,
        originalExpiresAt: input.expiresAt,
      },
    });
    await this.entry(
      tx,
      input.studentUserId,
      input.sourceKey,
      'GRANTED',
      input.amountMinor,
      input.amountMinor - debtPaid,
      input.reason,
      input.orderId,
      input.actorUserId,
    );
    return grant;
  }
  async reserve(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    orderId: string,
    amountMinor: number,
  ) {
    if (!amountMinor) return;
    const balance = await this.balanceWithClient(tx, studentUserId);
    if (balance.debtMinor || balance.availableMinor < amountMinor)
      throw new ConflictException('Insufficient available student credit');
    const reservation = await tx.studentCreditReservation.create({
      data: { studentUserId, orderId, amountMinor },
    });
    const grants = await tx.studentCreditGrant.findMany({
      where: { studentUserId, remainingMinor: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    let remaining = amountMinor;
    for (const grant of grants) {
      if (!remaining) break;
      const used = Math.min(grant.remainingMinor, remaining);
      await tx.studentCreditGrant.update({
        where: { id: grant.id },
        data: { remainingMinor: { decrement: used } },
      });
      await tx.studentCreditAllocation.create({
        data: {
          reservationId: reservation.id,
          grantId: grant.id,
          amountMinor: used,
        },
      });
      remaining -= used;
    }
    await this.entry(
      tx,
      studentUserId,
      `reserve:${orderId}`,
      'RESERVED',
      amountMinor,
      -amountMinor,
      'Credit reserved at checkout',
      orderId,
    );
  }
  async assertReservation(
    tx: Prisma.TransactionClient,
    order: { id: string; studentUserId: string; creditAppliedMinor?: number },
  ) {
    if (!order.creditAppliedMinor) return;
    await this.lock(tx, order.studentUserId);
    const reservation = await tx.studentCreditReservation.findUnique({
      where: { orderId: order.id },
    });
    if (
      reservation?.status !== 'RESERVED' ||
      reservation.amountMinor !== order.creditAppliedMinor
    )
      throw new CreditUnavailableError();
  }
  async consume(
    tx: Prisma.TransactionClient,
    order: { id: string; studentUserId: string; creditAppliedMinor?: number },
  ) {
    if (!order.creditAppliedMinor) return;
    await this.assertReservation(tx, order);
    await tx.studentCreditReservation.update({
      where: { orderId: order.id },
      data: { status: 'SPENT' },
    });
    await this.entry(
      tx,
      order.studentUserId,
      `spend:${order.id}`,
      'SPENT',
      order.creditAppliedMinor,
      0,
      'Reserved credit spent',
      order.id,
    );
  }
  async release(tx: Prisma.TransactionClient, orderId: string) {
    const reservation = await tx.studentCreditReservation.findUnique({
      where: { orderId },
    });
    if (!reservation) return;
    await this.lock(tx, reservation.studentUserId);
    const claimed = await tx.studentCreditReservation.updateMany({
      where: { id: reservation.id, status: 'RESERVED' },
      data: { status: 'RELEASED' },
    });
    if (!claimed.count) return;
    const allocations = await tx.studentCreditAllocation.findMany({
      where: { reservationId: reservation.id },
      include: { grant: true },
    });
    for (const allocation of allocations) {
      await this.restore(
        tx,
        allocation.grantId,
        allocation.amountMinor,
        `release:${allocation.id}`,
        'Checkout reservation released',
        orderId,
        false,
      );
      await tx.studentCreditAllocation.update({
        where: { id: allocation.id },
        data: { returnedMinor: allocation.amountMinor },
      });
    }
    await this.entry(
      tx,
      reservation.studentUserId,
      `released:${orderId}`,
      'RELEASED',
      reservation.amountMinor,
      0,
      'Reservation released; returned amounts recorded as grants',
      orderId,
    );
  }
  private async restore(
    tx: Prisma.TransactionClient,
    grantId: string,
    amountMinor: number,
    key: string,
    reason: string,
    orderId: string,
    extendExpiry: boolean,
  ) {
    const owner = await tx.studentCreditGrant.findUniqueOrThrow({
      where: { id: grantId },
    });
    await this.expire(tx, owner.studentUserId);
    const grant = await tx.studentCreditGrant.findUniqueOrThrow({
      where: { id: grantId },
    });
    // Reversal has already recovered this allocation from debt or other lots.
    // Compensate that recovery even if the revoked lot has since expired.
    if (grant.revokedAt) {
      await this.grant(tx, {
        studentUserId: grant.studentUserId,
        sourceKey: key,
        amountMinor,
        reason,
        orderId,
        expiresAt: grant.expiresAt
          ? new Date(
              Math.max(Date.now() + 30 * 86400000, grant.expiresAt.getTime()),
            )
          : null,
      });
      return;
    }
    // Unpaid reservations keep their original expiry. Record a released,
    // expired allocation without making it spendable or creating reversal debt.
    if (!extendExpiry && grant.expiresAt && grant.expiresAt <= new Date()) {
      await this.entry(
        tx,
        grant.studentUserId,
        `expire:${grant.id}:${key}`,
        'EXPIRED',
        amountMinor,
        0,
        'Reserved credit expired before release',
        orderId,
      );
      return;
    }
    const expiresAt =
      extendExpiry && grant.expiresAt
        ? new Date(
            Math.max(Date.now() + 30 * 86400000, grant.expiresAt.getTime()),
          )
        : grant.expiresAt;
    // Refunds get their own lot: extending it must not renew unused credit
    // or other reservations from the original lot. Keep a flattened origin
    // so reward reversals also recover returned credit and its later returns.
    const account = await this.lock(tx, grant.studentUserId);
    const debtPaid = Math.min(account.debtMinor, amountMinor);
    if (debtPaid)
      await tx.studentCreditAccount.update({
        where: { studentUserId: grant.studentUserId },
        data: { debtMinor: { decrement: debtPaid } },
      });
    if (extendExpiry)
      await tx.studentCreditGrant.create({
        data: {
          studentUserId: grant.studentUserId,
          sourceKey: key,
          amountMinor,
          remainingMinor: amountMinor - debtPaid,
          expiresAt,
          originalExpiresAt: expiresAt,
          rootGrantId: grant.rootGrantId ?? grant.id,
        },
      });
    else
      await tx.studentCreditGrant.update({
        where: { id: grant.id },
        data: { remainingMinor: { increment: amountMinor - debtPaid } },
      });
    await this.entry(
      tx,
      grant.studentUserId,
      key,
      'RETURNED',
      amountMinor,
      amountMinor - debtPaid,
      reason,
      orderId,
    );
  }
  async returnSpent(
    tx: Prisma.TransactionClient,
    orderId: string,
    refundId: string,
    amountMinor: number,
  ) {
    const reservation = await tx.studentCreditReservation.findUniqueOrThrow({
      where: { orderId },
      include: { allocations: { orderBy: { id: 'asc' } } },
    });
    await this.lock(tx, reservation.studentUserId);
    let remaining = amountMinor;
    for (const allocation of reservation.allocations) {
      const returned = Math.min(
        remaining,
        allocation.amountMinor - allocation.returnedMinor,
      );
      if (!returned) continue;
      await this.restore(
        tx,
        allocation.grantId,
        returned,
        `refund:${refundId}:${allocation.id}`,
        'Spent credit returned after refund',
        orderId,
        true,
      );
      await tx.studentCreditAllocation.update({
        where: { id: allocation.id },
        data: { returnedMinor: { increment: returned } },
      });
      remaining -= returned;
      if (!remaining) break;
    }
    if (remaining)
      throw new ConflictException('Credit refund exceeds the amount spent');
  }
  async debit(
    tx: Prisma.TransactionClient,
    studentUserId: string,
    sourceKey: string,
    amountMinor: number,
    reason: string,
    actorUserId?: string,
  ) {
    await this.expire(tx, studentUserId);
    const grants = await tx.studentCreditGrant.findMany({
      where: { studentUserId, remainingMinor: { gt: 0 } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    let remaining = amountMinor;
    for (const grant of grants) {
      const used = Math.min(remaining, grant.remainingMinor);
      if (used)
        await tx.studentCreditGrant.update({
          where: { id: grant.id },
          data: { remainingMinor: { decrement: used } },
        });
      remaining -= used;
      if (!remaining) break;
    }
    if (remaining)
      await tx.studentCreditAccount.update({
        where: { studentUserId },
        data: { debtMinor: { increment: remaining } },
      });
    await this.entry(
      tx,
      studentUserId,
      sourceKey,
      'ADJUSTED',
      -amountMinor,
      -(amountMinor - remaining),
      reason,
      undefined,
      actorUserId,
    );
  }
  async reverseGrant(
    tx: Prisma.TransactionClient,
    sourceKey: string,
    orderId: string,
  ) {
    const found = await tx.studentCreditGrant.findUnique({
      where: { sourceKey },
    });
    if (!found) return;
    await this.lock(tx, found.studentUserId);
    const grant = await tx.studentCreditGrant.findUniqueOrThrow({
      where: { id: found.id },
    });
    if (grant.revokedAt) return;
    const lots = await tx.studentCreditGrant.findMany({
      where: { OR: [{ id: grant.id }, { rootGrantId: grant.id }] },
    });
    const remainingMinor = lots.reduce(
      (sum, lot) => sum + lot.remainingMinor,
      0,
    );
    // Expired amounts have already been removed, and must not create debt.
    const expired = await tx.studentCreditEntry.aggregate({
      where: {
        OR: lots.map((lot) => ({ key: { startsWith: `expire:${lot.id}:` } })),
      },
      _sum: { amountMinor: true },
    });
    const missing =
      grant.amountMinor - remainingMinor - (expired._sum.amountMinor ?? 0);
    await tx.studentCreditGrant.updateMany({
      where: { id: { in: lots.map((lot) => lot.id) } },
      data: { remainingMinor: 0, revokedAt: new Date() },
    });
    if (missing)
      await this.debit(
        tx,
        grant.studentUserId,
        `reverse-debt:${grant.id}`,
        missing,
        'Previously used reward reversed',
      );
    await this.entry(
      tx,
      grant.studentUserId,
      `reverse:${grant.id}`,
      'REVERSED',
      -grant.amountMinor,
      -remainingMinor,
      'Purchase reward reversed after refund',
      orderId,
    );
  }
  async adjust(
    actor: RequestUser,
    studentUserId: string,
    dto: AdjustStudentCreditDto,
  ) {
    assertSuperAdmin(actor);
    if (!dto.amountMinor || !dto.key.trim() || dto.reason.trim().length < 3)
      throw new BadRequestException(
        'A nonzero amount, key and reason are required',
      );
    return this.prisma.$transaction(async (tx) => {
      if (
        !(await tx.studentProfile.findUnique({
          where: { userId: studentUserId },
        }))
      )
        throw new NotFoundException('Student not found');
      await this.lock(tx, studentUserId);
      const key = `admin:${studentUserId}:${dto.key}`;
      const prior = await tx.studentCreditEntry.findUnique({ where: { key } });
      if (prior) {
        if (
          prior.amountMinor !== dto.amountMinor ||
          prior.reason !== dto.reason.trim()
        )
          throw new ConflictException(
            'Adjustment key was already used for a different request',
          );
        if (dto.amountMinor > 0) {
          const grant = await tx.studentCreditGrant.findUniqueOrThrow({
            where: { sourceKey: key },
          });
          if (
            (grant.originalExpiresAt?.getTime() ?? null) !==
            (dto.expiresAt?.getTime() ?? null)
          )
            throw new ConflictException(
              'Adjustment key was already used for a different expiry',
            );
        }
        return this.balanceWithClient(tx, studentUserId);
      }
      if (dto.expiresAt && dto.expiresAt <= new Date())
        throw new BadRequestException('Credit expiry must be in the future');
      if (dto.amountMinor > 0)
        await this.grant(tx, {
          studentUserId,
          sourceKey: key,
          amountMinor: dto.amountMinor,
          reason: dto.reason.trim(),
          expiresAt: dto.expiresAt,
          actorUserId: actor.id,
        });
      else
        await this.debit(
          tx,
          studentUserId,
          key,
          -dto.amountMinor,
          dto.reason.trim(),
          actor.id,
        );
      await this.audit.recordWithClient(tx, {
        actorUserId: actor.id,
        action: 'STUDENT_CREDIT_ADJUSTED',
        targetType: 'StudentProfile',
        targetId: studentUserId,
        metadata: {
          key: dto.key,
          amountMinor: dto.amountMinor,
          reason: dto.reason.trim(),
        },
      });
      return this.balanceWithClient(tx, studentUserId);
    });
  }
}
