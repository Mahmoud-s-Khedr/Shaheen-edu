import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '../types/roles.enum';
import type { RequestWithUser } from '../types/request-with-user.types';

/**
 * Dedicated guard for /admin/admins/* routes. Functionally equivalent to
 * RolesGuard pinned to SUPER_ADMIN, but kept as its own class for intent
 * and readability on the most sensitive route group.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user || request.user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Forbidden');
    }
    return true;
  }
}
