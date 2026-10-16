import { ForbiddenException } from '@nestjs/common';
import { Role } from '../types/roles.enum';
import type { RequestUser } from '../types/request-with-user.types';

export function assertContentStaff(actor: Pick<RequestUser, 'role'>): void {
  if (actor?.role !== Role.ADMIN && actor?.role !== Role.SUPER_ADMIN)
    throw new ForbiddenException('Forbidden');
}

export function assertSuperAdmin(actor: Pick<RequestUser, 'role'>): void {
  if (actor?.role !== Role.SUPER_ADMIN)
    throw new ForbiddenException('Forbidden');
}
