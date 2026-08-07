import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AccountStatus, Role } from '../types/roles.enum';
import type { RequestWithUser } from '../types/request-with-user.types';

/** Requires ParentAuthGuard to have run first (reads req.parentSession). */
@Injectable()
export class ParentSelectedChildGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.parentSession?.activeStudentId) {
      throw new BadRequestException('No child selected for this session');
    }
    const student = await this.prisma.user.findUnique({
      where: { id: request.parentSession.activeStudentId },
      select: { role: true, status: true },
    });
    if (
      !student ||
      student.role !== Role.STUDENT ||
      student.status !== AccountStatus.ACTIVE
    ) {
      throw new ForbiddenException('Selected child is unavailable');
    }
    return true;
  }
}
