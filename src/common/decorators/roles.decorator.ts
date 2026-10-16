import { ApiExtension, ApiForbiddenResponse } from '@nestjs/swagger';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import type { Role } from '../types/roles.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    ApiExtension('x-roles', roles),
    ApiForbiddenResponse({
      description:
        'The authenticated role is not permitted to perform this operation.',
    }),
  );
