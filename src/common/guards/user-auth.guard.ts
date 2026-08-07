import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PASSWORD_CHANGE_ALLOWED_KEY } from '../decorators/password-change-allowed.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AccountStatus } from '../types/roles.enum';
import type { UserAccessTokenPayload } from '../types/jwt-payload.types';
import type { RequestWithUser } from '../types/request-with-user.types';
import type { AppConfig } from '../../config/configuration';

/**
 * Global auth guard (registered as APP_GUARD in AppModule). Deny-by-default:
 * every route needs either @Public() or a valid Bearer user access token.
 *
 * Parent-scoped routes are also marked @Public() to skip this guard, and
 * separately apply ParentAuthGuard locally - see parent-auth.guard.ts.
 */
@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const passwordChangeAllowed = this.reflector.getAllAndOverride<boolean>(
      PASSWORD_CHANGE_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Unauthorized');
    }
    const token = authHeader.slice('Bearer '.length);

    let payload: UserAccessTokenPayload;
    try {
      payload = jwt.verify(
        token,
        this.configService.get('jwt', { infer: true }).accessSecret,
      ) as UserAccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    if (payload.typ !== 'user_access') {
      throw new UnauthorizedException('Unauthorized');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revoked ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (user.mustChangePassword && !passwordChangeAllowed) {
      throw new ForbiddenException('Password change required');
    }

    request.user = { id: user.id, role: user.role, sessionId: session.id };
    return true;
  }
}
