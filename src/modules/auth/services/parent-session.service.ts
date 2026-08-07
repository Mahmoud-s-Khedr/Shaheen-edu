import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { TokenService } from './token.service';
import type { ParentAccessSession } from '@prisma/client';
import { AccountStatus } from '../../../common/types/roles.enum';
import {
  toPaginationMeta,
  type PaginationQueryDto,
} from '../../../common/dto/pagination-query.dto';

@Injectable()
export class ParentSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async createSession(params: {
    parentPhoneNormalized: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ accessToken: string; session: ParentAccessSession }> {
    const expiresAt = new Date(
      Date.now() + this.tokenService.parentAccessTtlSeconds * 1000,
    );
    const session = await this.prisma.parentAccessSession.create({
      data: {
        parentPhoneNormalized: params.parentPhoneNormalized,
        activeStudentId: null,
        expiresAt,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
    const accessToken = this.tokenService.signParentAccessToken({
      parentSessionId: session.id,
      activeStudentId: null,
    });
    return { accessToken, session };
  }

  async listChildren(
    parentPhoneNormalized: string,
    pagination: PaginationQueryDto,
  ) {
    const where = { parentPhoneNormalized };
    const [children, total] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({
        where,
        select: {
          userId: true,
          fullName: true,
          governorate: true,
          center: true,
          user: { select: { status: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      this.prisma.studentProfile.count({ where }),
    ]);
    return {
      data: children.map(({ user, ...child }) => ({ ...child, status: user.status })),
      meta: toPaginationMeta(pagination.page, pagination.limit, total),
    };
  }

  /**
   * Re-signs the parent access token with the updated `active` claim after
   * verifying the target student actually belongs to this parent phone.
   */
  async selectChild(params: {
    parentSessionId: string;
    parentPhoneNormalized: string;
    studentUserId: string;
  }): Promise<{ accessToken: string }> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: params.studentUserId },
      include: { user: { select: { status: true } } },
    });
    if (
      !student ||
      student.parentPhoneNormalized !== params.parentPhoneNormalized
    ) {
      throw new ForbiddenException('Student is not linked to this parent');
    }
    if (student.user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Selected child is unavailable');
    }

    const session = await this.prisma.parentAccessSession.findUnique({
      where: { id: params.parentSessionId },
    });
    if (!session || session.revoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Unauthorized');
    }

    await this.prisma.parentAccessSession.update({
      where: { id: session.id },
      data: { activeStudentId: student.userId },
    });

    const accessToken = this.tokenService.signParentAccessToken({
      parentSessionId: session.id,
      activeStudentId: student.userId,
    });
    return { accessToken };
  }
}
