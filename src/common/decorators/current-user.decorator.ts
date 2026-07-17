import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  RequestParentSession,
  RequestUser,
  RequestWithUser,
} from '../types/request-with-user.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);

export const CurrentParentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestParentSession | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.parentSession;
  },
);
