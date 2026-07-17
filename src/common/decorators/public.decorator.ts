import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as exempt from the global UserAuthGuard. Also used to skip
 * the global user guard on parent-scoped routes, which then apply
 * ParentAuthGuard locally instead (see common/guards/parent-auth.guard.ts).
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
