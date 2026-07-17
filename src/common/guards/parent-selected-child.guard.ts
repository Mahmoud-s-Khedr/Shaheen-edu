import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { RequestWithUser } from '../types/request-with-user.types';

/** Requires ParentAuthGuard to have run first (reads req.parentSession). */
@Injectable()
export class ParentSelectedChildGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.parentSession?.activeStudentId) {
      throw new BadRequestException('No child selected for this session');
    }
    return true;
  }
}
