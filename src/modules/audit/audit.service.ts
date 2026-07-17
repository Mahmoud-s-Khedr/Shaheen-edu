import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '@prisma/client';

export interface RecordAuditLogInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    const correlationId = this.cls.isActive() ? this.cls.getId() : undefined;
    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
        correlationId,
      },
    });
  }
}
